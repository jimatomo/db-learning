import { expect, test } from "@playwright/test";

test("insights page loads", async ({ page }) => {
  await page.goto("/insights");
  await expect(page.getByRole("heading", { name: "ラベル別（件数）" })).toBeVisible({ timeout: 15_000 });
});

test("home shows kanban and lesson badge", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "カンバン" })).toBeVisible();
  await expect(page.getByRole("button", { name: "TODO を追加" })).toBeVisible();
  await expect(page.getByText(/LESSON\s+C/)).toBeVisible({ timeout: 30_000 });
});
