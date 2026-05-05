import path from "node:path";
import { expect, test } from "@playwright/test";

const parquetFixturePath = path.resolve(process.cwd(), "sample-data/test.parquet");

test("uploads a GeoParquet file", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Add Data/i }).click();
  await page.locator("#dataset-upload").setInputFiles(parquetFixturePath);
  await expect(page.getByText("GeoParquet parsed and ready to add.")).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: /^Add Layer$/i }).click();
  await expect(page.getByText("Test")).toBeVisible({ timeout: 15000 });
});
