import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";
import JSZip from "jszip";
async function workbook() {
  const b = new ExcelJS.Workbook();
  const s = b.addWorksheet("縦");
  s.addRow(["メーカー", "品名", "CS数", "稼働予定日", "入数"]);
  s.addRow(["メーカーA", "元の景品A", 1, new Date("2026-11-05T00:00:00Z"), 12]);
  s.addRow(["メーカーB", "元の景品B", 2, "2026/11/5", 24]);
  s.addRow(["メーカーC", "別日の景品", 3, "2026-11-06", 36]);
  const zip = await JSZip.loadAsync(await b.xlsx.writeBuffer());
  const xml = await zip.file("[Content_Types].xml")!.async("string");
  zip.file(
    "[Content_Types].xml",
    xml.replace(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
      "application/vnd.ms-excel.sheet.macroEnabled.main+xml",
    ),
  );
  zip.file("xl/vbaProject.bin", "VBA fixture - must never execute");
  return zip.generateAsync({ type: "nodebuffer" });
}
test("Excelの取込・日付抽出・編集・一括追加・再読込重複防止", async ({
  page,
}) => {
  const externalRequests: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:1420") &&
      !r.url().startsWith("ws://127.0.0.1:1420")
    )
      externalRequests.push(r.url());
  });
  await page.goto("/");
  await page.locator('[data-kind="1"]').click();
  await page.getByText("Excel入荷予定表を読み込む", { exact: true }).click();
  const buffer = await workbook();
  await page.locator("#excelFile").setInputFiles({
    name: "入替指示書_マクロ版(3).xlsm",
    mimeType: "application/vnd.ms-excel.sheet.macroEnabled.12",
    buffer,
  });
  await expect(page.locator("#excelResult")).toHaveText("3件表示 / 0件選択");
  await page.locator("#excelDay").fill("2026-11-05");
  await expect(page.locator("#excelResult")).toHaveText("2件表示 / 0件選択");
  await page
    .getByRole("button", { name: "表示商品を全選択", exact: true })
    .click();
  await page
    .locator("#excelRows tr")
    .filter({ has: page.getByLabel("投稿用商品名 元の景品A", { exact: true }) })
    .getByText("投稿名を編集", { exact: true })
    .click();
  await page
    .getByLabel("投稿用商品名 元の景品A", { exact: true })
    .fill("投稿用の景品A");
  await page.getByLabel("投稿用商品名 元の景品A", { exact: true }).press("Tab");
  await expect(page.locator("#status")).toHaveText(
    "投稿用商品名・状態を保存しました",
  );
  await page
    .getByLabel("商品状態 元の景品A", { exact: true })
    .selectOption("入荷済み");
  await expect(
    page.getByLabel("商品状態 元の景品A", { exact: true }),
  ).toHaveValue("入荷済み");
  await page
    .getByRole("button", { name: "選択した商品を追加", exact: true })
    .click();
  await expect(page.locator("#threadPanel")).toContainText("投稿用の景品A");
  await expect(page.locator("#threadPanel")).toContainText("元の景品B");
  await expect(page.locator("#threadPanel")).toContainText(
    "予定です（状態未確認）。",
  );
  await expect(page.locator("#threadPanel")).not.toContainText("別日の景品");
  await expect(page.locator("#products [data-product]")).toHaveCount(2);
  // 同じファイルを読み直しても投稿名・状態が残り、マスターが増えない。
  await page.locator("#excelFile").setInputFiles({
    name: "別名.xlsm",
    mimeType: "application/octet-stream",
    buffer,
  });
  await expect(page.locator("#excelResult")).toHaveText("3件表示 / 0件選択");
  await expect(
    page.getByLabel("投稿用商品名 元の景品A", { exact: true }),
  ).toHaveValue("投稿用の景品A");
  await expect(
    page.getByLabel("商品状態 元の景品A", { exact: true }),
  ).toHaveValue("入荷済み");
  await expect(page.locator("#products [data-product]")).toHaveCount(2);
  await page.locator("#excelFrom").fill("2026-11-05");
  await page.locator("#excelTo").fill("2026-11-06");
  await page.getByRole("button", { name: "期間で検索", exact: true }).click();
  await expect(page.locator("#excelResult")).toHaveText("3件表示 / 0件選択");
  await page.locator("#excelDay").fill("2026-12-01");
  await expect(page.locator("#excelResult")).toContainText(
    "対象商品がありません",
  );
  await page.reload();
  await page.getByText("Excel入荷予定表を読み込む", { exact: true }).click();
  await expect(page.locator("#excelSource")).toContainText("別名.xlsm");
  await expect(
    page.getByLabel("投稿用商品名 元の景品A", { exact: true }),
  ).toHaveValue("投稿用の景品A");
  expect(externalRequests).toEqual([]);
});
test("Excelのドロップと読込失敗時の既存データ保護", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-kind="1"]').click();
  await page.getByText("Excel入荷予定表を読み込む", { exact: true }).click();
  const data = Array.from(await workbook());
  await page.evaluate((bytes) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(bytes)], "ドロップ.xlsx"));
    document.querySelector("#excelDrop")!.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
      }),
    );
  }, data);
  await expect(page.locator("#excelResult")).toHaveText("3件表示 / 0件選択");
  await page.locator("#excelFile").setInputFiles({
    name: "破損.xlsx",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("broken"),
  });
  await expect(page.locator("#status")).toContainText("Excel読み込み失敗");
  await expect(page.locator("#excelResult")).toHaveText("3件表示 / 0件選択");
  await expect(page.locator("#excelSource")).toContainText("ドロップ.xlsx");
});

test("チェックした商品だけを追加し、日付変更・再追加・削除・並替えを制御する", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-kind="1"]').click();
  await page.locator("#excelFile").setInputFiles({
    name: "選択テスト.xlsx",
    mimeType: "application/octet-stream",
    buffer: await workbook(),
  });
  await expect(page.locator("#excelResult")).toHaveText("3件表示 / 0件選択");
  await expect(page.locator("#addExcel")).toBeDisabled();
  await expect(
    page.locator("#excelRows input[type=checkbox]:checked"),
  ).toHaveCount(0);
  await page.locator("#excelDay").fill("2026-11-05");
  await page.locator("[data-excel-check]").first().check();
  await expect(page.locator("#excelResult")).toHaveText("2件表示 / 1件選択");
  await page.locator("#addExcel").click();
  await expect(page.locator("#addedList [data-added]")).toHaveCount(1);
  await expect(page.locator("#addedList")).toContainText("元の景品A");
  await expect(page.locator("#addedList")).not.toContainText("元の景品B");
  await expect(page.locator("#threadPanel")).not.toContainText("元の景品B");
  await expect(page.locator("#products [data-product]")).toHaveCount(1);
  // 追加後も自動では次の商品を選ばない。
  await expect(page.locator("#addExcel")).toBeDisabled();
  await page.locator("[data-excel-check]").first().check();
  await page.locator("#addExcel").click();
  await expect(page.locator("#addedList [data-added]")).toHaveCount(1);
  await page.locator("[data-excel-check]").first().check();
  await page.locator("#excelDay").fill("2026-11-06");
  await expect(
    page.locator("#excelRows input[type=checkbox]:checked"),
  ).toHaveCount(0);
  await expect(page.locator("#addExcel")).toBeDisabled();
  await page.locator("[data-excel-check]").first().check();
  await page.locator("#addExcel").click();
  await expect(page.locator("#addedList [data-added]")).toHaveCount(2);
  await page
    .getByRole("button", { name: "別日の景品を上へ", exact: true })
    .click();
  await expect(page.locator("#addedList [data-added]").first()).toContainText(
    "別日の景品",
  );
  const text = await page.locator("#threadPanel").innerText();
  expect(text.indexOf("別日の景品")).toBeLessThan(text.indexOf("元の景品A"));
  await page
    .getByRole("button", { name: "元の景品Aを投稿から削除", exact: true })
    .click();
  await expect(page.locator("#addedList [data-added]")).toHaveCount(1);
  await expect(page.locator("#threadPanel")).not.toContainText("元の景品A");
  await page.locator("#excelDay").fill("2026-11-05");
  await page.locator("[data-excel-check]").nth(1).check();
  await page.locator("#addExcel").click();
  await expect(page.locator("#addedList [data-added]")).toHaveCount(2);
  await expect(page.locator("#addedList")).not.toContainText("元の景品A");
  await expect(page.locator("#addedList")).toContainText("元の景品B");
  // 絞り込み変更でもチェックを解除し、見えない商品は追加できない。
  await page.locator("[data-excel-check]").first().check();
  await page.locator("#excelMakerFilter").fill("メーカーB");
  await expect(page.locator("#excelResult")).toHaveText("1件表示 / 0件選択");
  await expect(page.locator("#addExcel")).toBeDisabled();
  await page.locator("#excelNameFilter").fill("該当しない");
  await expect(page.locator("#excelResult")).toContainText("0件表示");
  await expect(page.locator("#addExcel")).toBeDisabled();
});

test("添付実ファイルの135件から指定日のチェックした1件だけを追加する", async ({
  page,
}) => {
  const path = process.env.EXCEL_FIXTURE_PATH;
  test.skip(!path, "添付のローカル検証用ファイルはCIへ持ち込まない");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.locator('[data-kind="1"]').click();
  await page.locator("#excelFile").setInputFiles(path!);
  await expect(page.locator("#excelResult")).toHaveText("135件表示 / 0件選択");
  await expect(page.locator("#addExcel")).toBeDisabled();
  await page.locator("#excelDay").fill("2026-11-05");
  await expect(page.locator("#excelResult")).toHaveText("8件表示 / 0件選択");
  const firstName = await page
    .locator("#excelRows [data-excel-name]")
    .first()
    .inputValue();
  await page.locator("[data-excel-check]").first().check();
  await page.locator("#addExcel").click();
  await expect(page.locator("#addedList [data-added]")).toHaveCount(1);
  await expect(page.locator("#products [data-product]")).toHaveCount(1);
  await expect(page.locator("#threadPanel")).toContainText(firstName);
  if (process.env.EXCEL_SCREENSHOT)
    await page.screenshot({
      path: process.env.EXCEL_SCREENSHOT,
      fullPage: true,
    });
});
