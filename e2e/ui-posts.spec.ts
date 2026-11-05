import { test, expect, type Page } from "@playwright/test";
import { initialState, excelKey } from "../src/domain";
async function seed(page: Page, count = 40) {
  const state = initialState();
  const rows = Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `景品${i} 日本語の長い正式名称 テスト用ブランケット`,
    maker: "メーカー会社",
    work: "作品",
    character: "",
    arrivalDate: "",
    status: "予定" as const,
    excel: {
      key: excelKey(
        "2026-11-06",
        `景品${i} 日本語の長い正式名称 テスト用ブランケット`,
        "メーカー会社",
        i + 2,
      ),
      rowNumber: i + 2,
      scheduledDate: "2026-11-06",
      originalName: `景品${i} 日本語の長い正式名称 テスト用ブランケット`,
      originalMaker: "メーカー会社",
      units: 40,
      cs: 1,
    },
  }));
  state.products = rows;
  state.excelSource = { name: "test.xlsx", path: null, rows };
  await page.addInitScript(
    (data) => localStorage.setItem("prize-post-maker-v1", JSON.stringify(data)),
    state,
  );
  await page.goto("/");
  await expect(page.locator("#excelResult")).toContainText(`${count}件表示`);
}
async function checkLayout(page: Page) {
  const geometry = await page.evaluate(() => {
    const rect = (id: string) =>
      document.querySelector(id)!.getBoundingClientRect();
    const main = rect("main"),
      footer = rect("#status"),
      header = rect("header");
    return {
      doc: document.documentElement.scrollWidth,
      viewport: innerWidth,
      mainBottom: main.bottom,
      footerTop: footer.top,
      footerBottom: footer.bottom,
      height: innerHeight,
      headerBottom: header.bottom,
      mainTop: main.top,
    };
  });
  expect(geometry.doc).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.headerBottom).toBeLessThanOrEqual(geometry.mainTop + 1);
  expect(geometry.mainBottom).toBeLessThanOrEqual(geometry.footerTop + 1);
  expect(geometry.footerBottom).toBeLessThanOrEqual(geometry.height + 1);
  await page.locator("[data-excel-check]").first().check();
  await page.locator("#addExcel").scrollIntoViewIfNeeded();
  const button = await page.locator("#addExcel").evaluate((el) => {
    const r = el.getBoundingClientRect(),
      hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return {
      height: r.height,
      hit: el === hit || el.contains(hit),
      tableBottom: document.querySelector("#excelRows")!.getBoundingClientRect()
        .bottom,
      top: r.top,
    };
  });
  expect(button.height).toBeGreaterThanOrEqual(28);
  expect(button.hit).toBe(true);
  expect(button.tableBottom).toBeLessThanOrEqual(button.top + 1);
  const independent = await page.evaluate(() => {
    const right = document.querySelector("aside")!,
      list = document.querySelector("#excelRows")!;
    const before = right.scrollTop;
    list.scrollTop = 300;
    return {
      scroll: list.scrollTop,
      rightBefore: before,
      rightAfter: right.scrollTop,
    };
  });
  expect(independent.scroll).toBeGreaterThan(0);
  expect(independent.rightAfter).toBe(independent.rightBefore);
}
for (const cfg of [
  { name: "100%", width: 1920, height: 1080, dpr: 1 },
  { name: "125%相当", width: 1536, height: 864, dpr: 1.25 },
  { name: "150%相当", width: 1280, height: 720, dpr: 1.5 },
  { name: "小型画面150%相当", width: 910, height: 512, dpr: 1.5 },
  { name: "最小サイズ", width: 640, height: 480, dpr: 1 },
]) {
  test(`レイアウト重なり防止・独立スクロール ${cfg.name}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: cfg.width, height: cfg.height },
      deviceScaleFactor: cfg.dpr,
    });
    const page = await context.newPage();
    try {
      await seed(page);
      await page.locator("#theme").click();
      await checkLayout(page);
      expect(
        await page
          .locator("[data-excel-check]")
          .first()
          .evaluate((el) => el.getBoundingClientRect().width),
      ).toBeGreaterThanOrEqual(18);
      if (process.env.PRIZE_SCREENSHOT && cfg.name === "125%相当") {
        await page.locator("#addExcel").click();
        await page.locator("#editor").evaluate((el) => (el.scrollTop = 0));
        await page.screenshot({
          path: process.env.PRIZE_SCREENSHOT,
          fullPage: true,
        });
      }
    } finally {
      await context.close();
    }
  });
}
test("列幅をキーボードで変更しリサイズ後もボタンが重ならない", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  const before = await page
    .locator(".product-table th")
    .nth(1)
    .evaluate((el) => el.getBoundingClientRect().width);
  await page.getByText("列幅を調整", { exact: true }).click();
  await page.getByLabel("商品名の列幅", { exact: true }).focus();
  await page.getByLabel("商品名の列幅", { exact: true }).press("End");
  const after = await page
    .locator(".product-table th")
    .nth(1)
    .evaluate((el) => el.getBoundingClientRect().width);
  expect(after).toBeGreaterThan(before);
  await page.locator("#theme").click();
  for (const size of [
    { width: 800, height: 600 },
    { width: 1400, height: 800 },
  ]) {
    await page.setViewportSize(size);
    await checkLayout(page);
  }
});
test("月・日付の即時反映とツリーの個別コピー・確認解除・順序変更", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (text: string) => {
          (window as unknown as { copied: string }).copied = text;
        },
      },
    });
    window.open = (url?: string | URL) => {
      (window as unknown as { opened: string }).opened = String(url);
      return null;
    };
  });
  await seed(page, 8);
  await page.locator("#postMonth").selectOption("12");
  await expect(page.locator("#preview")).toContainText("✨12月入荷予定表✨");
  await expect(page.locator("#preview")).not.toContainText("景品0");
  await page.locator('[data-kind="1"]').click();
  await page.locator("#date").fill("2026-11-06");
  await page.locator("#selectAllExcel").click();
  await page.locator("#addExcel").click();
  await expect(page.locator("#preview")).toHaveText(
    "🆕万代書店長野店プライズ入荷情報🆕\n\n11月6日の入荷のお知らせです！詳細はツリーにて⬇️",
  );
  await expect(page.locator("#threadPanel")).toContainText("状態未確認");
  await expect(page.locator("#threadPanel")).not.toContainText("稼働中です。");
  await page.locator("[data-added-status]").first().selectOption("稼働中");
  await expect(page.locator("#threadPanel")).toContainText(" / 稼働中です。");
  const child = page.locator('[data-thread="1"]');
  await expect(child.locator("[data-post-copy]")).toBeDisabled();
  await child.locator("[data-post-confirm]").check();
  await child.locator("[data-post-copy]").click();
  const copied = await page.evaluate(
    () => (window as unknown as { copied: string }).copied,
  );
  expect(copied).toContain("・景品0");
  expect(copied).not.toContain("メーカー会社");
  expect(copied).not.toContain("2026");
  await page
    .getByRole("button", { name: "2投稿目を上へ", exact: true })
    .click();
  await expect(page.locator('[data-thread="0"] pre')).toContainText("・景品0");
  await expect(page.locator("[data-post-confirm]:checked")).toHaveCount(0);
  await page.locator('[data-thread="0"] [data-post-confirm]').check();
  await page.locator('[data-thread="0"] [data-post-open]').click();
  expect(
    await page.evaluate(() => (window as unknown as { opened: string }).opened),
  ).toContain("https://x.com/intent/post?");
});

test("過長の商品名を切り詰めず警告し、手動修正で復帰する", async ({ page }) => {
  await seed(page, 1);
  await page.locator('[data-kind="1"]').click();
  await page.locator("#excelRows .name-edit summary").first().click();
  await page.locator("[data-excel-name]").first().fill("あ".repeat(200));
  await page.locator("[data-excel-name]").first().press("Tab");
  await expect(page.locator("#status")).toHaveText(
    "投稿用商品名・状態を保存しました",
  );
  await page.locator("[data-excel-check]").first().check();
  await page.locator("#addExcel").click();
  await expect(page.locator("#generationError")).toContainText(
    "自動で切り詰めず停止",
  );
  await expect(page.locator("#copy")).toBeDisabled();
  await expect(page.locator("[data-thread]")).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("prize-post-maker-v1")!).products[0]
          .name.length,
    ),
  ).toBe(200);
  await page.locator("#excelRows .name-edit summary").first().click();
  await page
    .locator("[data-excel-name]")
    .first()
    .fill("担当者が修正した短い品名");
  await page.locator("[data-excel-name]").first().press("Tab");
  await expect(page.locator("#generationError")).toBeEmpty();
  await expect(page.locator("#threadPanel")).toContainText(
    "担当者が修正した短い品名",
  );
});
