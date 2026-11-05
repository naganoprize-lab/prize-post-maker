import { test, expect } from "@playwright/test";
test("登録から生成・確認・履歴・リロードまで", async ({ page }) => {
  await page.goto("/");
  await page
    .getByText("商品マスター（登録・編集・CSV）", { exact: true })
    .click();
  await page.getByLabel("商品名（必須）", { exact: true }).fill("テスト景品");
  await page.getByLabel("作品名", { exact: true }).fill("テスト作品");
  await page.getByRole("button", { name: "商品を保存", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("商品を保存しました");
  await page.locator("[data-product]").check();
  await expect(page.locator("#preview")).toContainText("テスト景品");
  await expect(page.locator("#preview")).toContainText("入荷日未確認");
  await expect(page.locator("#preview")).toContainText("#テスト作品");
  await expect(page.locator("#copy")).toBeDisabled();
  await page.locator("#confirmed").check();
  await expect(page.locator("#copy")).toBeEnabled();
  await page.locator("#text").fill("人が編集した投稿");
  await expect(page.locator("#preview")).toHaveText("人が編集した投稿");
  await expect(page.locator("#confirmed")).not.toBeChecked();
  await page
    .getByRole("button", { name: "作成履歴に保存", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("作成履歴を保存");
  await page.reload();
  await page
    .getByText("作成履歴（投稿済みを意味しません・直近200件）", { exact: true })
    .click();
  await expect(page.locator("#history")).toContainText("人が編集した投稿");
  await page.getByRole("button", { name: "文章を再利用", exact: true }).click();
  await expect(page.locator("#preview")).toHaveText("人が編集した投稿");
  await page.locator("#text").fill("あ".repeat(141));
  await page.locator("#confirmed").check();
  await expect(page.locator("#copy")).toBeDisabled();
  await expect(page.locator("#counter")).toContainText("282 / 280");
});
test("保存データ破損時には編集を停止してデータを保護する", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem("prize-post-maker-v1", "broken"),
  );
  await page.reload();
  await expect(page.getByRole("status")).toContainText("読み込み失敗");
  await expect(page.locator("#productForm")).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("prize-post-maker-v1")),
  ).toBe("broken");
});
