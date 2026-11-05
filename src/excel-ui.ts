import { invoke, isTauri } from "@tauri-apps/api/core";
import { productStatuses, product, type State, type Product } from "./domain";
import {
  checkExcelName,
  filterSchedule,
  MAX_EXCEL_BYTES,
  mergeExcel,
  readExcel,
} from "./excel";
import { checkedProducts } from "./selection";
interface Context {
  sidebar?: HTMLElement;
  getState: () => State;
  commit: (state: State) => Promise<void>;
  select: (ids: string[]) => void;
  notify: (message: string) => void;
}
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export async function mountExcel(host: HTMLElement, ctx: Context) {
  host.innerHTML = `<h2>Excelの商品を選択</h2><div id="excelSidebar"><details class="excel-panel" open><summary>Excel入荷予定表を読み込む</summary><div id="excelDrop" class="drop-zone" tabindex="0" role="group" aria-label="Excelファイルのドロップ領域"><p>.xlsm / .xlsx をドロップ</p><button id="chooseExcel">Excelファイルを選択</button><input id="excelFile" type="file" accept=".xlsm,.xlsx" hidden></div><p id="excelSource" class="hint"></p><button id="reloadExcel">元ファイルを再読み込み</button><p class="hint">VBA・数式は実行しません。稼働予定日は確定日ではありません。</p></details><fieldset id="excelSearch"><legend>日付・商品を検索</legend><label>単日カレンダー<input id="excelDay" type="date"></label><button id="findExcelDay">この日の商品を表示</button><label>開始日<input id="excelFrom" type="date"></label><label>終了日<input id="excelTo" type="date"></label><button id="findExcelRange">期間で検索</button><button id="showAllExcel">すべての日付を表示</button><label>商品名で絞り込み<input id="excelNameFilter" type="search"></label><label>メーカーで絞り込み<input id="excelMakerFilter" type="search"></label></fieldset></div><fieldset id="excelControls"><legend>Excel検索結果</legend><div class="row"><button id="selectAllExcel">表示商品を全選択</button><button id="clearExcelSelection">選択を解除</button></div><p id="excelResult" role="status"></p><details class="column-settings"><summary>列幅を調整</summary><div class="row">${[
    ["name", "商品名", 260, 160, 600],
    ["maker", "メーカー", 100, 70, 240],
    ["date", "予定日", 102, 90, 200],
    ["status", "状態", 110, 95, 180],
  ]
    .map(
      ([key, label, value, min, max]) =>
        `<label>${label}<input type="range" data-column="${key}" value="${value}" min="${min}" max="${max}" aria-label="${label}の列幅"></label>`,
    )
    .join(
      "",
    )}</div></details><div id="excelRows" tabindex="0" aria-label="Excel商品一覧"></div><button id="addExcel" class="primary" disabled>選択した商品を追加</button><p class="hint">チェックした商品だけを投稿へ追加します。検索の変更でチェックを解除します。</p></fieldset>`;
  if (ctx.sidebar) ctx.sidebar.append(document.querySelector("#excelSidebar")!);
  const input = document.querySelector<HTMLInputElement>("#excelFile")!;
  host.querySelectorAll<HTMLInputElement>("[data-column]").forEach(
    (slider) =>
      (slider.oninput = () => {
        host.style.setProperty(
          "--col-" + slider.dataset.column,
          slider.value + "px",
        );
      }),
  );
  const chosen = new Set<string>();
  let shown: Product[] = [];
  let range: { from: string; to: string } | null = null;
  let busy = false;
  const all = () => ctx.getState().excelSource?.rows ?? [];
  function source() {
    const s = ctx.getState().excelSource;
    document.querySelector("#excelSource")!.textContent = s
      ? `読込元: ${s.name}${s.path ? "（パスを記憶済み）" : "（ブラウザでは再選択が必要です）"}`
      : "ファイル未選択";
    document.querySelector<HTMLButtonElement>("#reloadExcel")!.disabled =
      !s || busy;
  }
  function syncAdd() {
    document.querySelector<HTMLButtonElement>("#addExcel")!.disabled =
      busy || checkedProducts(shown, chosen).length === 0;
  }
  function result(message: string) {
    document.querySelector("#excelResult")!.textContent = message;
    syncAdd();
  }
  function render() {
    const normalize = (s: string) => s.normalize("NFKC").toLocaleLowerCase();
    const name = normalize(val("excelNameFilter")),
      maker = normalize(val("excelMakerFilter"));
    shown = (range ? filterSchedule(all(), range.from, range.to) : all())
      .filter(
        (p) =>
          normalize(p.name + " " + p.excel!.originalName).includes(name) &&
          normalize(p.maker).includes(maker),
      )
      .sort((a, b) => (a.excel!.rowNumber ?? 0) - (b.excel!.rowNumber ?? 0));
    const visibleKeys = new Set(shown.map((p) => p.excel!.key));
    for (const key of chosen) if (!visibleKeys.has(key)) chosen.delete(key);
    result(
      shown.length
        ? `${shown.length}件表示 / ${chosen.size}件選択`
        : "0件表示 / 0件選択 · 該当する稼働予定日の対象商品がありません",
    );
    const rows = document.querySelector("#excelRows")!;
    rows.innerHTML = `<table class="product-table"><colgroup><col style="width:38px"><col style="width:var(--col-name,260px)"><col style="width:var(--col-maker,100px)"><col style="width:var(--col-date,102px)"><col style="width:var(--col-status,110px)"><col style="width:52px"><col style="width:52px"><col style="width:48px"></colgroup><thead><tr><th scope="col">選択</th><th scope="col">品名／投稿名</th><th scope="col">メーカー</th><th scope="col">稼働予定日</th><th scope="col">確認した状態</th><th scope="col">入数</th><th scope="col">CS数</th><th scope="col">元行</th></tr></thead><tbody>${shown.map((p) => `<tr><td><input type="checkbox" data-excel-check="${esc(p.excel!.key)}" ${chosen.has(p.excel!.key) ? "checked" : ""} aria-label="${esc(p.excel!.originalName)} ${p.excel!.rowNumber}行目を選択"></td><td><span class="formal-name">${esc(p.excel!.originalName)}</span><details class="name-edit"><summary>投稿名を編集</summary><input data-excel-name="${esc(p.excel!.key)}" value="${esc(p.name)}" maxlength="200" aria-label="投稿用商品名 ${esc(p.excel!.originalName)}"></details></td><td>${esc(p.maker)}</td><td>${esc(p.excel!.scheduledDate)}<small>予定</small></td><td><select data-excel-status="${esc(p.excel!.key)}" aria-label="商品状態 ${esc(p.excel!.originalName)}">${productStatuses.map((v) => `<option ${v === p.status ? "selected" : ""}>${v}</option>`).join("")}</select></td><td>${p.excel!.units ?? "—"}</td><td>${p.excel!.cs ?? "—"}</td><td>${p.excel!.rowNumber ?? "—"}</td></tr>`).join("")}</tbody></table>`;
    rows.querySelectorAll<HTMLInputElement>("[data-excel-check]").forEach(
      (c) =>
        (c.onchange = () => {
          c.checked
            ? chosen.add(c.dataset.excelCheck!)
            : chosen.delete(c.dataset.excelCheck!);
          result(`${shown.length}件表示 / ${chosen.size}件選択`);
        }),
    );
    rows
      .querySelectorAll<HTMLInputElement>("[data-excel-name]")
      .forEach(
        (c) =>
          (c.onchange = () =>
            void edit(c.dataset.excelName!, { name: c.value })),
      );
    rows.querySelectorAll<HTMLSelectElement>("[data-excel-status]").forEach(
      (c) =>
        (c.onchange = () =>
          void edit(c.dataset.excelStatus!, {
            status: c.value as Product["status"],
          })),
    );
    source();
  }
  async function edit(key: string, patch: Partial<Product>) {
    if (busy) return;
    setBusy(true);
    try {
      const state = ctx.getState(),
        s = state.excelSource!;
      const updated = product({
        ...s.rows.find((p) => p.excel!.key === key),
        ...patch,
      });
      await ctx.commit({
        ...state,
        products: state.products.map((p) =>
          p.excel?.key === key ? { ...p, ...patch } : p,
        ),
        excelSource: {
          ...s,
          rows: s.rows.map((p) => (p.excel!.key === key ? updated : p)),
        },
      });
      render();
      ctx.notify("投稿用商品名・状態を保存しました");
    } catch (e) {
      ctx.notify((e as Error).message);
    } finally {
      setBusy(false);
      render();
    }
  }
  function setBusy(value: boolean) {
    busy = value;
    document
      .querySelectorAll<HTMLButtonElement>(
        "#excelSidebar button, #excelControls button",
      )
      .forEach((b) => (b.disabled = value));
    document.querySelector<HTMLFieldSetElement>("#excelControls")!.disabled =
      value;
    document.querySelector<HTMLFieldSetElement>("#excelSearch")!.disabled =
      value;
    syncAdd();
    source();
  }
  async function apply(bytes: Uint8Array, name: string, path: string | null) {
    const incoming = await readExcel(bytes, name),
      state = ctx.getState();
    const previous = mergeExcel(
      state.excelSource?.rows ?? [],
      state.products.filter((p) => p.excel),
    );
    const merged = mergeExcel(previous, incoming),
      keys = new Set(incoming.map((p) => p.excel!.key));
    const byKey = new Map(
      merged.filter((p) => p.excel).map((p) => [p.excel!.key, p]),
    );
    const rows = incoming.map((p) => byKey.get(p.excel!.key)!);
    // 既存マスターのみ数量を更新。新商品は一括追加ボタンまでマスターへ追加しない。
    const incomingByKey = new Map(
      incoming.map((p) => [p.excel!.key, p.excel!]),
    );
    const products = state.products.map((p) =>
      p.excel && keys.has(p.excel.key)
        ? {
            ...p,
            excel: incomingByKey.get(p.excel.key)!,
          }
        : p,
    );
    await ctx.commit({ ...state, products, excelSource: { name, path, rows } });
    chosen.clear();
    for (const id of [
      "excelDay",
      "excelFrom",
      "excelTo",
      "excelNameFilter",
      "excelMakerFilter",
    ])
      (document.getElementById(id) as HTMLInputElement).value = "";
    range = null;
    render();
    ctx.notify(
      `${rows.length}件を読み込みました。日付で抽出し、選択商品を投稿へ追加してください`,
    );
  }
  async function readPath(path: string) {
    const name = path.split(/[\\/]/).pop()!;
    checkExcelName(name);
    const data = await invoke<ArrayBuffer>("read_excel", { path });
    await apply(new Uint8Array(data), name, path);
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (e) {
      ctx.notify(`Excel読み込み失敗: ${String((e as Error).message ?? e)}`);
    } finally {
      setBusy(false);
    }
  }
  async function file(file: File) {
    await run(async () => {
      checkExcelName(file.name);
      if (file.size > MAX_EXCEL_BYTES)
        throw Error("Excelファイルは20MB以下にしてください");
      await apply(new Uint8Array(await file.arrayBuffer()), file.name, null);
    });
  }
  document.querySelector<HTMLButtonElement>("#chooseExcel")!.onclick = () => {
    if (isTauri())
      void run(async () => {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const path = await open({
          multiple: false,
          directory: false,
          filters: [{ name: "Excel入荷予定表", extensions: ["xlsm", "xlsx"] }],
        });
        if (typeof path === "string") await readPath(path);
      });
    else input.click();
  };
  input.onchange = async () => {
    if (input.files?.[0]) await file(input.files[0]);
    input.value = "";
  };
  document.querySelector<HTMLButtonElement>("#reloadExcel")!.onclick = () => {
    const path = ctx.getState().excelSource?.path;
    if (isTauri() && path) void run(() => readPath(path));
    else {
      ctx.notify(
        "元ファイルを再選択してください。ブラウザではファイルパスを記憶できません",
      );
      input.click();
    }
  };
  const drop = document.querySelector<HTMLElement>("#excelDrop")!;
  drop.ondragover = (e) => {
    e.preventDefault();
    drop.classList.add("dragging");
  };
  drop.ondragleave = () => drop.classList.remove("dragging");
  drop.ondrop = (e) => {
    e.preventDefault();
    drop.classList.remove("dragging");
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length !== 1) {
      ctx.notify("Excelファイルを1つだけドロップしてください");
      return;
    }
    void file(files[0]);
  };
  if (isTauri()) {
    try {
      const { getCurrentWebview } = await import("@tauri-apps/api/webview");
      const unlisten = await getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type !== "drop") return;
        document.querySelector<HTMLDetailsElement>(
          "#excelSidebar details",
        )!.open = true;
        if (event.payload.paths.length !== 1) {
          ctx.notify("Excelファイルを1つだけドロップしてください");
          return;
        }
        const path = event.payload.paths[0];
        void run(() => readPath(path));
      });
      window.addEventListener("beforeunload", unlisten, { once: true });
    } catch (e) {
      ctx.notify(
        `ファイルドロップ初期化失敗: ${(e as Error).message}。ファイル選択ボタンを使用してください`,
      );
    }
  }
  const val = (id: string) =>
    document.querySelector<HTMLInputElement>("#" + id)!.value;
  function search(from: string, to = from) {
    chosen.clear();
    try {
      const found = filterSchedule(all(), from, to);
      range = { from, to };
      chosen.clear();
      render();
      if (!found.length) ctx.notify("該当する稼働予定日の対象商品がありません");
    } catch (e) {
      render();
      ctx.notify((e as Error).message);
    }
  }
  document.querySelector<HTMLButtonElement>("#findExcelDay")!.onclick = () =>
    search(val("excelDay"));
  document.querySelector<HTMLInputElement>("#excelDay")!.onchange = () =>
    search(val("excelDay"));
  document.querySelector<HTMLButtonElement>("#findExcelRange")!.onclick = () =>
    search(val("excelFrom"), val("excelTo"));
  document.querySelector<HTMLButtonElement>("#showAllExcel")!.onclick = () => {
    range = null;
    chosen.clear();
    render();
  };
  document.querySelector<HTMLButtonElement>("#selectAllExcel")!.onclick =
    () => {
      shown.forEach((p) => chosen.add(p.excel!.key));
      render();
    };
  document.querySelector<HTMLButtonElement>("#clearExcelSelection")!.onclick =
    () => {
      chosen.clear();
      render();
    };
  document.querySelector<HTMLButtonElement>("#addExcel")!.onclick =
    async () => {
      if (busy) return;
      setBusy(true);
      try {
        const rows = checkedProducts(shown, chosen);
        if (!rows.length) throw Error("投稿に追加する商品を選択してください");
        const state = ctx.getState(),
          products = mergeExcel(state.products, rows);
        await ctx.commit({ ...state, products });
        const byKey = new Map(
          products.filter((p) => p.excel).map((p) => [p.excel!.key, p.id]),
        );
        ctx.select(rows.map((p) => byKey.get(p.excel!.key)!));
        chosen.clear();
        render();
        ctx.notify(
          `${rows.length}件を投稿作成画面に追加しました。状態と文章を確認してください`,
        );
      } catch (e) {
        ctx.notify((e as Error).message);
      } finally {
        setBusy(false);
      }
    };
  for (const id of ["excelFrom", "excelTo"])
    document.getElementById(id)!.addEventListener("change", () => {
      chosen.clear();
      render();
    });
  for (const id of ["excelNameFilter", "excelMakerFilter"])
    document.getElementById(id)!.addEventListener("input", () => {
      chosen.clear();
      render();
    });
  document.addEventListener("products-changed", () => {
    if (!busy) render();
  });
  render();
}
