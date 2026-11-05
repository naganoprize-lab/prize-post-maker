import "./style.css";
export const kinds = [
  "月間入荷予定",
  "当日の入荷・稼働",
  "完売のお知らせ",
  "入荷遅延",
] as const;
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `<header><div><strong>プライズポストメーカー</strong><small>店舗の情報を、わかりやすく。</small></div><button id="theme">表示テーマ切替</button></header><main><nav aria-label="投稿種類"><h2>投稿をつくる</h2>${kinds.map((k, i) => `<button data-kind="${i}" class="${i === 0 ? "active" : ""}">${k}</button>`).join("")}<p>投稿は必ず担当者が確認してください。</p><div id="excelSearchHost"></div></nav><section id="editor"><h1 id="heading">月間入荷予定</h1><div id="workspace"><p>商品を登録して投稿を作成します。</p></div></section><aside><div id="addedProducts"></div><div id="postEditor"></div><h2>X 投稿プレビュー</h2><div class="post"><strong>あなたのお店</strong><small>@your_store · プレビュー</small><p id="preview">ここに投稿文章が表示されます。</p><div id="imagePreview"></div></div><p id="counter">0 / 280</p><div id="actions"></div></aside></main><div id="status" role="status" aria-live="polite"></div>`;
document.querySelectorAll<HTMLButtonElement>("[data-kind]").forEach(
  (button) =>
    (button.onclick = () => {
      document.querySelector(".active")?.classList.remove("active");
      button.classList.add("active");
      document.querySelector("#heading")!.textContent =
        kinds[Number(button.dataset.kind)];
    }),
);
document.querySelector<HTMLButtonElement>("#theme")!.onclick = () => {
  document.documentElement.dataset.theme =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
};

// 商品マスター。初期化に失敗した場合は保存操作を開放しない。
import {
  fields,
  labels,
  product,
  importCSV,
  exportCSV,
  type State,
} from "./domain";
import { load, save } from "./storage";
let state: State;
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const status = (text: string) => {
  document.querySelector("#status")!.textContent = text;
};
async function persist() {
  const next = { ...state };
  if (state.excelSource) {
    const byKey = new Map(
      state.products.filter((p) => p.excel).map((p) => [p.excel!.key, p]),
    );
    next.excelSource = {
      ...state.excelSource,
      rows: state.excelSource.rows.map((p) => byKey.get(p.excel!.key) ?? p),
    };
  }
  await save(next);
  state.excelSource = next.excelSource;
}

function master() {
  document.querySelector("#workspace")!.innerHTML =
    `<div id="excelHost"></div><div id="composer"></div><details><summary>商品マスター（登録・編集・CSV）</summary><form id="productForm">${fields.map((f, i) => `<label>${labels[i]}${i === 0 ? "（必須）" : ""}<input name="${f}" ${f === "arrivalDate" ? 'type="date"' : 'maxlength="200"'} ${i === 0 ? "required" : ""}></label>`).join("")}<label>登録ハッシュタグ（空白区切り）<input name="tags" maxlength="200"></label><input type="hidden" name="id"><button class="primary">商品を保存</button><button type="button" id="resetProduct">新規入力</button></form><div id="masterList"></div><label>CSVインポート<input id="csv" type="file" accept=".csv,text/csv"></label><button id="export">CSVエクスポート</button></details>`;
  renderMaster();
  document.querySelector<HTMLFormElement>("#productForm")!.onsubmit = async (
    e,
  ) => {
    e.preventDefault();
    try {
      const form = e.currentTarget as HTMLFormElement;
      const values = Object.fromEntries(new FormData(form));
      const existing = state.products.find((p) => p.id === values.id);
      const p = product({
        ...existing,
        ...values,
        hashtags: String(values.tags ?? "")
          .split(/\s+/)
          .map((t) => t.replace(/^#/, ""))
          .filter(Boolean),
      });
      const previous = state.products;
      state.products = state.products.filter((v) => v.id !== p.id).concat(p);
      try {
        await persist();
      } catch (e) {
        state.products = previous;
        throw e;
      }
      form.reset();
      renderMaster();
      status("商品を保存しました");
      document.dispatchEvent(new Event("products-changed"));
    } catch (e) {
      status((e as Error).message);
    }
  };
  document.querySelector<HTMLButtonElement>("#resetProduct")!.onclick = () =>
    document.querySelector<HTMLFormElement>("#productForm")!.reset();
  document.querySelector<HTMLInputElement>("#csv")!.onchange = async (e) => {
    const input = e.target as HTMLInputElement;
    try {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024)
        throw Error("CSVは5MB以下にしてください");
      const rows = importCSV(await file.text());
      const previous = state.products;
      state.products = [...state.products, ...rows];
      try {
        await persist();
      } catch (e) {
        state.products = previous;
        throw e;
      }
      renderMaster();
      document.dispatchEvent(new Event("products-changed"));
      status(`${rows.length}件を追加しました`);
    } catch (e) {
      status((e as Error).message);
    } finally {
      input.value = "";
    }
  };
  document.querySelector<HTMLButtonElement>("#export")!.onclick = () => {
    const url = URL.createObjectURL(
      new Blob([exportCSV(state.products)], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "products.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
}
function renderMaster() {
  const list = document.querySelector("#masterList")!;
  list.innerHTML =
    state.products
      .map(
        (p) =>
          `<div class="item">${escape(p.name)} <button data-edit="${escape(p.id)}">編集</button> <button data-delete="${escape(p.id)}">削除</button></div>`,
      )
      .join("") || "<p>商品は未登録です。</p>";
  list.querySelectorAll<HTMLButtonElement>("[data-edit]").forEach(
    (b) =>
      (b.onclick = () => {
        const p = state.products.find((p) => p.id === b.dataset.edit)!;
        const f = document.querySelector<HTMLFormElement>("#productForm")!;
        (f.elements.namedItem("tags") as HTMLInputElement).value = (
          p.hashtags ?? []
        ).join(" ");
        for (const key of [...fields, "id"] as const)
          (f.elements.namedItem(key) as HTMLInputElement).value = p[key];
      }),
  );
  list.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (!confirm("この商品を削除しますか？")) return;
        const previous = state.products;
        state.products = state.products.filter(
          (p) => p.id !== b.dataset.delete,
        );
        try {
          await persist();
          renderMaster();
          document.dispatchEvent(new Event("products-changed"));
        } catch (e) {
          state.products = previous;
          status((e as Error).message);
        }
      }),
  );
}
export const ready = load()
  .then((s) => {
    state = s;
    master();
    document.dispatchEvent(new Event("app-ready"));
  })
  .catch((e) => {
    status(
      `読み込み失敗。保存データを保護するため編集を停止しました: ${e.message}`,
    );
  });

import { titles, hashtags, countText, productStatuses } from "./domain";
let kind = 0;
const selected = new Set<string>();
function orderedSelected() {
  const byId = new Map(state.products.map((p) => [p.id, p]));
  return [...selected]
    .map((id) => byId.get(id))
    .filter((p): p is import("./domain").Product => Boolean(p));
}
let dirty = false;
let postQueue: string[] = [];
let activePost = 0;
function refreshThread() {
  const host = document.querySelector<HTMLElement>("#threadPanel");
  if (!host) return;
  renderThread(
    host,
    postQueue,
    activePost,
    (i) => {
      activePost = i;
      (document.querySelector("#text") as HTMLTextAreaElement).value =
        postQueue[i];
      updatePreview();
    },
    (i, d) => {
      const j = i + d;
      if (j < 0 || j >= postQueue.length) return;
      [postQueue[i], postQueue[j]] = [postQueue[j], postQueue[i]];
      activePost = j;
      (document.querySelector("#text") as HTMLTextAreaElement).value =
        postQueue[j];
      updatePreview();
    },
    status,
  );
}
function composer() {
  document.querySelector("#composer")!.innerHTML =
    `<details class="card" id="manualProducts"><summary>登録商品から選択</summary><label>商品を検索<input id="search" placeholder="商品名・作品・キャラクター・メーカー"></label><label>月間予定の対象月（任意）<input id="month" type="month"></label><div class="row"><button id="selectVisible">表示商品をすべて選択</button><button id="clearSelected">選択解除</button></div><p id="selectionCount" class="hint"></p><div id="products"></div></details><div class="card" id="postSettings"><h2>投稿を設定</h2><label id="postMonthLabel">入荷予定表の月<select id="postMonth">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}月</option>`).join("")}</select></label><p id="fixedHint" class="hint">月間・日別の案内文は指定の店舗文です。商品一覧は月間本文に挿入しません。</p><details id="customSettings"><summary>タイトル・テンプレート設定（完売・遅延用）</summary><label>タイトル候補<select id="titles"></select></label><label>タイトル<input id="title" maxlength="200"></label></details><label id="postDateLabel">対象日／ご案内日<input id="date" type="date"></label><label id="operationLabel">選択商品の状態を一括指定<select id="operation"><option value="">変更しない</option>${productStatuses.map((s) => `<option>${s}</option>`).join("")}</select></label><details id="advancedSettings"><summary>備考・テンプレート・タグ（必要な場合）</summary><label>備考（確認済みの情報のみ）<textarea id="note" maxlength="2000" placeholder="遅延後の日程が未定の場合は「変更後の日程は未定です」など、確認できた事実を入力"></textarea></label><label>テンプレート<select id="templates"></select></label><label>テンプレート本文<textarea id="templateBody" maxlength="10000"></textarea></label><p class="hint">利用できる変数: {title} {date} {products} {note} {hashtags} {count}</p><div class="row"><input id="templateName" maxlength="100" placeholder="テンプレート名" aria-label="テンプレート名"><button id="saveTemplate">新規保存</button><button id="updateTemplate">上書き保存</button><button id="deleteTemplate">削除</button></div><label>ハッシュタグ（編集可能）<textarea id="tags" maxlength="2000"></textarea></label><button id="autoTags">選択商品のタグを再生成</button></details><label id="threadTagsLabel"><input id="threadTags" type="checkbox">商品紹介の末尾にタグを付ける（任意）</label></div><div id="generationError" class="danger" role="alert"></div><div class="card" id="postText"><h2>最終文章を確認</h2><label>投稿文章（直接編集できます）<textarea id="text" maxlength="10000" rows="4"></textarea></label><p class="hint">設定変更で生成文に戻ります。手動編集済みの場合は確認します。</p><button id="regenerate">設定から文章を再生成</button><div id="threadPanel"></div></div><details><summary>作成履歴（投稿済みを意味しません・直近200件）</summary><div id="history"></div></details>`;
  (document.querySelector("#postMonth") as HTMLSelectElement).value = String(
    Number(todayTokyo().slice(5, 7)),
  );
  (document.querySelector("#date") as HTMLInputElement).value = todayTokyo();
  const value = (id: string) =>
    (document.getElementById(id) as HTMLInputElement).value;
  function regenerate(force = false) {
    if (
      dirty &&
      !force &&
      !confirm("手動編集した文章を設定から再生成してよいですか？")
    )
      return;
    document.dispatchEvent(new Event("post-changed"));
    dirty = false;
    try {
      postQueue = composePosts(
        kind,
        {
          title: value("title"),
          date: value("date"),
          month: Number(value("postMonth")),
          products: orderedSelected(),
          note: value("note"),
          hashtags: value("tags"),
        },
        value("templateBody"),
        (document.querySelector("#threadTags") as HTMLInputElement).checked,
      );
      activePost = 0;
      (document.querySelector("#text") as HTMLTextAreaElement).value =
        postQueue[0] ?? "";
      document.querySelector("#generationError")!.textContent = "";
    } catch (e) {
      postQueue = [];
      activePost = 0;
      document.querySelector("#generationError")!.textContent = (
        e as Error
      ).message;
      (document.querySelector("#text") as HTMLTextAreaElement).value = "";
    }
    renderAdded();
    updatePreview();
  }
  function renderAdded() {
    const products = orderedSelected();
    document.querySelector("#addedProducts")!.innerHTML =
      `<h2>投稿に追加済みの商品（${products.length}件）</h2><p class="hint">ここにある商品だけで投稿を作成します。</p><div id="addedList">${products.map((p, i) => `<article class="item" data-added="${escape(p.id)}"><strong>${escape(p.name)}</strong><details class="source-info"><summary>元の商品情報</summary><small>${escape(p.excel ? `元品名: ${p.excel.originalName} / ${p.excel.rowNumber ?? "不明"}行目 / ${p.excel.scheduledDate}（予定） / 入数 ${p.excel.units ?? "未入力"} / CS数 ${p.excel.cs ?? "未入力"}` : p.maker)}</small></details><label>確認した商品状態<select data-added-status="${escape(p.id)}" aria-label="${escape(p.name)}の状態">${productStatuses.map((v) => `<option ${v === (p.status ?? "予定") ? "selected" : ""}>${v}</option>`).join("")}</select></label><div class="row"><button data-move="${escape(p.id)}" data-direction="-1" ${i === 0 ? "disabled" : ""} aria-label="${escape(p.name)}を上へ">上へ</button><button data-move="${escape(p.id)}" data-direction="1" ${i === products.length - 1 ? "disabled" : ""} aria-label="${escape(p.name)}を下へ">下へ</button><button data-remove-added="${escape(p.id)}" aria-label="${escape(p.name)}を投稿から削除">投稿から削除</button></div></article>`).join("") || '<p class="hint">中央で商品にチェックを入れて追加してください。</p>'}</div>`;
    document
      .querySelectorAll<HTMLSelectElement>("[data-added-status]")
      .forEach(
        (c) =>
          (c.onchange = () =>
            void changeStatuses([c.dataset.addedStatus!], c.value)),
      );
    document.querySelectorAll<HTMLButtonElement>("[data-remove-added]").forEach(
      (b) =>
        (b.onclick = () => {
          selected.delete(b.dataset.removeAdded!);
          showProducts();
          refreshTags();
        }),
    );
    document.querySelectorAll<HTMLButtonElement>("[data-move]").forEach(
      (b) =>
        (b.onclick = () => {
          const ids = moveProduct(
            [...selected],
            b.dataset.move!,
            Number(b.dataset.direction) as -1 | 1,
          );
          selected.clear();
          ids.forEach((id) => selected.add(id));
          showProducts();
          refreshTags();
        }),
    );
  }
  async function changeStatuses(ids: string[], value: string) {
    const previous = state.products;
    state.products = state.products.map((p) =>
      ids.includes(p.id) ? product({ ...p, status: value }) : p,
    );
    try {
      await persist();
      document.dispatchEvent(new Event("products-changed"));
    } catch (e) {
      state.products = previous;
      status((e as Error).message);
      renderAdded();
    }
  }
  document.querySelector<HTMLSelectElement>("#operation")!.onchange = () => {
    const v = value("operation");
    if (v) void changeStatuses([...selected], v);
  };
  function populateTemplates() {
    (document.querySelector("#templates") as HTMLSelectElement).innerHTML =
      state.templates
        .map(
          (t) => `<option value="${escape(t.id)}">${escape(t.name)}</option>`,
        )
        .join("");
    setTemplate();
  }
  function setTemplate() {
    const t = state.templates.find((t) => t.id === value("templates"));
    (document.querySelector("#templateBody") as HTMLTextAreaElement).value =
      t?.body ?? "";
    (document.querySelector("#templateName") as HTMLInputElement).value =
      t?.name ?? "";
    regenerate();
  }
  function showProducts() {
    const query = value("search").toLocaleLowerCase();
    const month = value("month");
    const visible = state.products.filter(
      (p) =>
        fields.some((f) => p[f].toLocaleLowerCase().includes(query)) &&
        (!month ||
          kind !== 0 ||
          (p.excel?.scheduledDate ?? p.arrivalDate).startsWith(month)),
    );
    document.querySelector("#selectionCount")!.textContent =
      `${selected.size}件選択 / ${visible.length}件表示`;
    document.querySelector("#products")!.innerHTML =
      visible
        .map(
          (p) =>
            `<div class="item"><label><input type="checkbox" data-product="${escape(p.id)}" ${selected.has(p.id) ? "checked" : ""}>${escape(p.name)}<small>${escape([p.work, p.character, p.maker, p.excel ? `稼働予定 ${p.excel.scheduledDate}（未確定） / ${p.status}` : p.arrivalDate || "入荷日未確認"].filter(Boolean).join(" / "))}</small></label></div>`,
        )
        .join("") ||
      '<p class="hint">該当商品がありません。下の商品マスターから登録してください。</p>';
    document.querySelectorAll<HTMLInputElement>("[data-product]").forEach(
      (c) =>
        (c.onchange = () => {
          c.checked
            ? selected.add(c.dataset.product!)
            : selected.delete(c.dataset.product!);
          refreshTags();
          showProducts();
        }),
    );
    document.querySelector<HTMLButtonElement>("#selectVisible")!.onclick =
      () => {
        visible.forEach((p) => selected.add(p.id));
        refreshTags();
        showProducts();
      };
  }
  function refreshTags() {
    (document.querySelector("#tags") as HTMLTextAreaElement).value =
      hashtags(orderedSelected());
    regenerate();
  }
  function setKind() {
    (document.querySelector("#titles") as HTMLSelectElement).innerHTML = titles(
      kind,
    )
      .map((t) => `<option>${escape(t)}</option>`)
      .join("");
    (document.querySelector("#title") as HTMLInputElement).value =
      titles(kind)[0];
    (document.querySelector("#operationLabel") as HTMLElement).hidden =
      kind === 0;
    (document.querySelector("#postMonthLabel") as HTMLElement).hidden =
      kind !== 0;
    (document.querySelector("#postDateLabel") as HTMLElement).hidden =
      kind === 0;
    (document.querySelector("#customSettings") as HTMLElement).hidden =
      kind < 2;
    (document.querySelector("#threadTagsLabel") as HTMLElement).hidden =
      kind !== 1;
    (document.querySelector("#fixedHint") as HTMLElement).hidden = kind >= 2;
    (document.querySelector("#advancedSettings") as HTMLElement).hidden =
      kind === 0;
    for (const id of ["note", "templates", "templateBody"])
      (document.getElementById(id)!.parentElement as HTMLElement).hidden =
        kind < 2;
    (
      document.querySelector("#templateName")!.parentElement as HTMLElement
    ).hidden = kind < 2;
    document.querySelector("#advancedSettings summary")!.textContent =
      kind === 1
        ? "ハッシュタグ（任意）"
        : "備考・テンプレート・タグ（必要な場合）";
    (document.querySelector("#month")!.parentElement as HTMLElement).hidden =
      kind !== 0;
    showProducts();
    regenerate();
  }
  document.querySelectorAll<HTMLButtonElement>("[data-kind]").forEach((b) =>
    b.addEventListener("click", () => {
      kind = Number(b.dataset.kind);
      setKind();
    }),
  );
  document.querySelector("#titles")!.addEventListener("change", () => {
    (document.querySelector("#title") as HTMLInputElement).value =
      value("titles");
    regenerate();
  });
  [
    "title",
    "date",
    "note",
    "templateBody",
    "tags",
    "postMonth",
    "threadTags",
  ].forEach((id) =>
    document.getElementById(id)!.addEventListener("input", () => regenerate()),
  );
  document.querySelector("#text")!.addEventListener("input", () => {
    dirty = true;
    updatePreview();
  });
  document.querySelector("#regenerate")!.addEventListener("click", () => {
    if (!dirty || confirm("手動編集した文章を置き換えますか？"))
      regenerate(true);
  });
  document.querySelector("#search")!.addEventListener("input", showProducts);
  document.querySelector("#month")!.addEventListener("change", () => {
    selected.clear();
    showProducts();
    refreshTags();
  });
  document.querySelector("#clearSelected")!.addEventListener("click", () => {
    selected.clear();
    showProducts();
    refreshTags();
  });
  document.querySelector("#autoTags")!.addEventListener("click", refreshTags);
  document.querySelector("#templates")!.addEventListener("change", setTemplate);
  async function storeTemplate(update: boolean) {
    try {
      const name = value("templateName").trim(),
        body = value("templateBody");
      if (!name || !body.trim())
        throw Error("テンプレート名と本文を入力してください");
      const previous = state.templates;
      const id = update ? value("templates") : crypto.randomUUID();
      if (!id) throw Error("上書きするテンプレートを選択してください");
      state.templates = state.templates
        .filter((t) => t.id !== id)
        .concat({ id, name, body });
      try {
        await persist();
      } catch (e) {
        state.templates = previous;
        throw e;
      }
      populateTemplates();
      (document.querySelector("#templates") as HTMLSelectElement).value = id;
      setTemplate();
      status("テンプレートを保存しました");
    } catch (e) {
      status((e as Error).message);
    }
  }
  document
    .querySelector("#saveTemplate")!
    .addEventListener("click", () => void storeTemplate(false));
  document
    .querySelector("#updateTemplate")!
    .addEventListener("click", () => void storeTemplate(true));
  document
    .querySelector("#deleteTemplate")!
    .addEventListener("click", async () => {
      if (!value("templates") || !confirm("テンプレートを削除しますか？"))
        return;
      const previous = state.templates;
      state.templates = state.templates.filter(
        (t) => t.id !== value("templates"),
      );
      try {
        await persist();
        populateTemplates();
      } catch (e) {
        state.templates = previous;
        status((e as Error).message);
      }
    });
  document.addEventListener("products-changed", () => {
    for (const id of selected)
      if (!state.products.some((p) => p.id === id)) selected.delete(id);
    showProducts();
    refreshTags();
  });
  document.addEventListener("excel-products-selected", (event) => {
    const ids = (event as CustomEvent<string[]>).detail;
    const next = appendUnique(
      [...selected],
      ids.filter((id) => state.products.some((p) => p.id === id)),
    );
    selected.clear();
    next.forEach((id) => selected.add(id));
    (document.querySelector("#search") as HTMLInputElement).value = "";
    (document.querySelector("#month") as HTMLInputElement).value = "";
    showProducts();
    refreshTags();
  });
  document.addEventListener("history-changed", renderHistory);
  function renderHistory() {
    document.querySelector("#history")!.innerHTML =
      state.history
        .map(
          (h) =>
            `<div class="item"><small>${escape(new Date(h.createdAt).toLocaleString("ja-JP"))} · ${escape(h.kind)}</small><p style="white-space:pre-wrap">${escape(h.text)}</p><button data-history="${escape(h.id)}">文章を再利用</button><button data-remove-history="${escape(h.id)}">削除</button></div>`,
        )
        .join("") || "<p>履歴はありません。</p>";
    document.querySelectorAll<HTMLButtonElement>("[data-history]").forEach(
      (b) =>
        (b.onclick = () => {
          const h = state.history.find((h) => h.id === b.dataset.history)!;
          if (dirty && !confirm("編集中の文章を履歴で置き換えますか？")) return;
          postQueue = [h.text];
          activePost = 0;
          (document.querySelector("#text") as HTMLTextAreaElement).value =
            h.text;
          dirty = true;
          updatePreview();
        }),
    );
    document
      .querySelectorAll<HTMLButtonElement>("[data-remove-history]")
      .forEach(
        (b) =>
          (b.onclick = async () => {
            if (!confirm("この履歴を削除しますか？")) return;
            const previous = state.history;
            state.history = state.history.filter(
              (h) => h.id !== b.dataset.removeHistory,
            );
            try {
              await persist();
              renderHistory();
            } catch (e) {
              state.history = previous;
              status((e as Error).message);
            }
          }),
      );
  }
  populateTemplates();
  setKind();
  renderHistory();
}
function updatePreview() {
  const text =
    (document.querySelector("#text") as HTMLTextAreaElement)?.value ?? "";
  if (postQueue.length) postQueue[activePost] = text;
  else if (text.trim()) {
    postQueue = [text];
    activePost = 0;
  }
  refreshThread();
  document.querySelector("#preview")!.textContent =
    text || "商品を選択すると文章が表示されます。";
  const count = countText(text);
  document.querySelector("#counter")!.textContent =
    `${count.weighted} / 280（Xの重み付き文字数）${count.valid ? "" : " · 投稿内容を確認してください"}`;
  document.querySelector("#counter")!.classList.toggle("danger", !count.valid);
  document.dispatchEvent(new Event("post-changed"));
}
function startup() {
  composer();
  const postEditor = document.querySelector("#postEditor")!;
  postEditor.append(
    document.querySelector("#postSettings")!,
    document.querySelector("#generationError")!,
    document.querySelector("#postText")!,
  );
  document.documentElement.dataset.theme = state.theme;
  document.querySelector<HTMLButtonElement>("#theme")!.onclick = async () => {
    const previous = state.theme;
    state.theme =
      state.theme === "system"
        ? "dark"
        : state.theme === "dark"
          ? "light"
          : "system";
    try {
      await persist();
      document.documentElement.dataset.theme = state.theme;
      status(
        `表示テーマ: ${state.theme === "system" ? "OS設定" : state.theme === "dark" ? "ダーク" : "ライト"}`,
      );
    } catch (e) {
      state.theme = previous;
      status((e as Error).message);
    }
  };
}
document.addEventListener("app-ready", startup, { once: true });

import { intentURL, validateImages } from "./x";
import { isTauri } from "@tauri-apps/api/core";
function xActions() {
  document.querySelector("#actions")!.innerHTML =
    `<label>画像を選択（最大4枚）<input id="images" type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple></label><button id="clearImages">画像を解除</button><p class="hint">画像はXに自動添付されません。下の元ファイル名を確認し、X画面で手動添付してください。画像は保存されません。</p><label><input id="confirmed" type="checkbox">文章・商品情報・入荷日・画像を担当者が確認しました</label><button id="copy" class="primary" disabled>文章をコピー</button><button id="openX" disabled>Xの投稿画面へ移動</button><button id="saveHistory">作成履歴に保存</button><p class="hint">Xへのログイン・最終投稿はブラウザで行ってください。自動投稿は行いません。</p>`;
  const text = () =>
    (document.querySelector("#text") as HTMLTextAreaElement).value;
  const confirmed = document.querySelector<HTMLInputElement>("#confirmed")!;
  let urls: string[] = [];
  function enabled() {
    const valid = confirmed.checked && countText(text()).valid;
    for (const id of ["copy", "openX"])
      (document.getElementById(id) as HTMLButtonElement).disabled = !valid;
  }
  function reset() {
    confirmed.checked = false;
    refreshThread();
    enabled();
  }
  document.addEventListener("post-changed", reset);
  confirmed.onchange = enabled;
  async function record() {
    if (!text().trim()) throw Error("保存する文章がありません");
    const previous = state.history;
    state.history = [
      {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        kind: kinds[kind],
        text: text(),
      },
      ...state.history,
    ].slice(0, 200);
    try {
      await persist();
    } catch (e) {
      state.history = previous;
      throw e;
    }
    document.dispatchEvent(new Event("history-changed"));
  }
  document.querySelector<HTMLButtonElement>("#saveHistory")!.onclick =
    async () => {
      try {
        await record();
        status("作成履歴を保存しました（投稿はしていません）");
      } catch (e) {
        status(`履歴保存失敗: ${(e as Error).message}`);
      }
    };
  document.querySelector<HTMLButtonElement>("#copy")!.onclick = async () => {
    try {
      if (!confirmed.checked) throw Error("最終確認が必要です");
      intentURL(text());
      await navigator.clipboard.writeText(text());
      status("コピーしました。X画面で貼り付けてください");
    } catch (e) {
      status(`コピー失敗: ${(e as Error).message}`);
    }
  };
  document.querySelector<HTMLButtonElement>("#openX")!.onclick = async () => {
    try {
      if (!confirmed.checked) throw Error("最終確認が必要です");
      const url = intentURL(text());
      if (isTauri()) {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(url);
      } else {
        const popup = window.open(url, "_blank", "noopener,noreferrer");
        void popup;
      }
      status(
        "ブラウザで文章を確認し、画像を手動添付してください。投稿操作は担当者が行ってください",
      );
    } catch (e) {
      status(`X画面を開けませんでした: ${(e as Error).message}`);
    }
  };
  const images = document.querySelector<HTMLInputElement>("#images")!;
  function clear() {
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls = [];
    images.value = "";
    document.querySelector("#imagePreview")!.innerHTML = "";
    reset();
  }
  document.querySelector<HTMLButtonElement>("#clearImages")!.onclick = clear;
  images.onchange = async () => {
    reset();
    const files = Array.from(images.files ?? []);
    try {
      validateImages(files);
      // MIMEだけではなくブラウザで画像として復号できることを確認する。
      const next = files.map((file) => ({
        file,
        url: URL.createObjectURL(file),
      }));
      try {
        await Promise.all(
          next.map(
            ({ url }) =>
              new Promise<void>((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve();
                img.onerror = () =>
                  reject(Error("読み込めない画像が含まれています"));
                img.src = url;
              }),
          ),
        );
      } catch (e) {
        next.forEach((i) => URL.revokeObjectURL(i.url));
        throw e;
      }
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls = next.map((i) => i.url);
      document.querySelector("#imagePreview")!.innerHTML = next
        .map(
          ({ file, url }) =>
            `<div><img class="image" src="${url}" alt="${escape(file.name)}"><small>${escape(file.name)}</small></div>`,
        )
        .join("");
      reset();
    } catch (e) {
      clear();
      status((e as Error).message);
    }
  };
  window.addEventListener("beforeunload", () =>
    urls.forEach((u) => URL.revokeObjectURL(u)),
  );
}
document.addEventListener("app-ready", xActions, { once: true });

import { mountExcel } from "./excel-ui";
document.addEventListener(
  "app-ready",
  () => {
    void mountExcel(document.querySelector<HTMLElement>("#excelHost")!, {
      sidebar: document.querySelector<HTMLElement>("#excelSearchHost")!,
      getState: () => state,
      commit: async (next) => {
        await save(next);
        state = next;
        renderMaster();
        document.dispatchEvent(new Event("products-changed"));
      },
      select: (ids) =>
        document.dispatchEvent(
          new CustomEvent("excel-products-selected", { detail: ids }),
        ),
      notify: status,
    });
  },
  { once: true },
);

import { moveProduct, appendUnique } from "./selection";

import { composePosts, todayTokyo } from "./posts";
import { renderThread } from "./thread-ui";
