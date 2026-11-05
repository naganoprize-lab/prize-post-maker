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
    .getByRole("button", { name: "選択商品を投稿作成へ一括追加", exact: true })
    .click();
  await expect(page.locator("#preview")).toContainText("投稿用の景品A");
  await expect(page.locator("#preview")).toContainText("元の景品B");
  await expect(page.locator("#preview")).toContainText(
    "稼働確定日ではありません",
  );
  await expect(page.locator("#preview")).not.toContainText("別日の景品");
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
