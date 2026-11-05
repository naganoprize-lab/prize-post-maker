import { invoke, isTauri } from "@tauri-apps/api/core";
import { productStatuses, product, type State, type Product } from "./domain";
import {
  checkExcelName,
  filterSchedule,
  MAX_EXCEL_BYTES,
  mergeExcel,
  readExcel,
} from "./excel";
interface Context {
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
  host.innerHTML = `<details class="excel-panel"><summary>Excel入荷予定表を読み込む</summary><div id="excelDrop" class="drop-zone" tabindex="0" role="group" aria-label="Excelファイルのドロップ領域"><p>.xlsm / .xlsx をここへドロップ</p><button id="chooseExcel">Excelファイルを選択</button><input id="excelFile" type="file" accept=".xlsm,.xlsx" hidden></div><p id="excelSource" class="hint"></p><button id="reloadExcel">元ファイルを再読み込み</button><p class="hint">「縦」シートの保存済み値を読みます。マクロ・数式は実行しません。稼働予定日は稼働の確定日ではありません。</p><fieldset id="excelControls"><legend>稼働予定日で抽出</legend><label>単日カレンダー<input id="excelDay" type="date"></label><button id="findExcelDay">この日の商品を表示</button><div class="row"><label>開始日<input id="excelFrom" type="date"></label><label>終了日<input id="excelTo" type="date"></label></div><button id="findExcelRange">期間で検索</button><button id="showAllExcel">すべての日付を表示</button><div class="row"><button id="selectAllExcel">表示商品を全選択</button><button id="clearExcelSelection">選択を解除</button></div><p id="excelResult" role="status"></p><div id="excelRows"></div><button id="addExcel" class="primary">選択商品を投稿作成へ一括追加</button></fieldset></details>`;
  const input = host.querySelector<HTMLInputElement>("#excelFile")!;
  const chosen = new Set<string>();
  let shown: Product[] = [];
  let range: { from: string; to: string } | null = null;
  let busy = false;
  const all = () => ctx.getState().excelSource?.rows ?? [];
  function source() {
    const s = ctx.getState().excelSource;
    host.querySelector("#excelSource")!.textContent = s
      ? `読込元: ${s.name}${s.path ? "（パスを記憶済み）" : "（ブラウザでは再選択が必要です）"}`
      : "ファイル未選択";
    host.querySelector<HTMLButtonElement>("#reloadExcel")!.disabled =
      !s || busy;
  }
  function result(message: string) {
    host.querySelector("#excelResult")!.textContent = message;
  }
  function render() {
    shown = range ? filterSchedule(all(), range.from, range.to) : all();
    const visibleKeys = new Set(shown.map((p) => p.excel!.key));
    for (const key of chosen) if (!visibleKeys.has(key)) chosen.delete(key);
    result(
      shown.length
        ? `${shown.length}件表示 / ${chosen.size}件選択`
        : "該当する稼働予定日の対象商品がありません",
    );
    const rows = host.querySelector("#excelRows")!;
    rows.innerHTML = shown
      .map(
        (p) =>
          `<article class="item"><label><input type="checkbox" data-excel-check="${esc(p.excel!.key)}" ${chosen.has(p.excel!.key) ? "checked" : ""}>${esc(p.excel!.originalName)}</label><small>稼働予定 ${esc(p.excel!.scheduledDate)}（未確定） / ${esc(p.maker)} / 入数 ${p.excel!.units ?? "未入力"} / CS数 ${p.excel!.cs ?? "未入力"}</small><label>投稿用商品名<input data-excel-name="${esc(p.excel!.key)}" value="${esc(p.name)}" maxlength="200" aria-label="投稿用商品名 ${esc(p.excel!.originalName)}"></label><label>商品状態<select data-excel-status="${esc(p.excel!.key)}" aria-label="商品状態 ${esc(p.excel!.originalName)}">${productStatuses.map((s) => `<option ${s === p.status ? "selected" : ""}>${s}</option>`).join("")}</select></label></article>`,
      )
      .join("");
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
    host
      .querySelectorAll<HTMLButtonElement>("button")
      .forEach((b) => (b.disabled = value));
    host.querySelector<HTMLFieldSetElement>("#excelControls")!.disabled = value;
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
    const rows = merged.filter((p) => p.excel && keys.has(p.excel.key));
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
  host.querySelector<HTMLButtonElement>("#chooseExcel")!.onclick = () => {
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
  host.querySelector<HTMLButtonElement>("#reloadExcel")!.onclick = () => {
    const path = ctx.getState().excelSource?.path;
    if (isTauri() && path) void run(() => readPath(path));
    else {
      ctx.notify(
        "元ファイルを再選択してください。ブラウザではファイルパスを記憶できません",
      );
      input.click();
    }
  };
  const drop = host.querySelector<HTMLElement>("#excelDrop")!;
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
        host.querySelector<HTMLDetailsElement>("details")!.open = true;
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
    host.querySelector<HTMLInputElement>("#" + id)!.value;
  function search(from: string, to = from) {
    try {
      const found = filterSchedule(all(), from, to);
      range = { from, to };
      chosen.clear();
      render();
      if (!found.length) ctx.notify("該当する稼働予定日の対象商品がありません");
    } catch (e) {
      ctx.notify((e as Error).message);
    }
  }
  host.querySelector<HTMLButtonElement>("#findExcelDay")!.onclick = () =>
    search(val("excelDay"));
  host.querySelector<HTMLInputElement>("#excelDay")!.onchange = () =>
    search(val("excelDay"));
  host.querySelector<HTMLButtonElement>("#findExcelRange")!.onclick = () =>
    search(val("excelFrom"), val("excelTo"));
  host.querySelector<HTMLButtonElement>("#showAllExcel")!.onclick = () => {
    range = null;
    chosen.clear();
    render();
  };
  host.querySelector<HTMLButtonElement>("#selectAllExcel")!.onclick = () => {
    shown.forEach((p) => chosen.add(p.excel!.key));
    render();
  };
  host.querySelector<HTMLButtonElement>("#clearExcelSelection")!.onclick =
    () => {
      chosen.clear();
      render();
    };
  host.querySelector<HTMLButtonElement>("#addExcel")!.onclick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const rows = shown.filter((p) => chosen.has(p.excel!.key));
      if (!rows.length) throw Error("投稿に追加する商品を選択してください");
      const state = ctx.getState(),
        products = mergeExcel(state.products, rows);
      await ctx.commit({ ...state, products });
      const keys = new Set(rows.map((p) => p.excel!.key));
      ctx.select(
        products
          .filter((p) => p.excel && keys.has(p.excel.key))
          .map((p) => p.id),
      );
      ctx.notify(
        `${rows.length}件を投稿作成画面に追加しました。状態と文章を確認してください`,
      );
    } catch (e) {
      ctx.notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  document.addEventListener("products-changed", () => {
    if (!busy) render();
  });
  render();
}
