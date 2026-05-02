import path from "node:path";

import { expect, test } from "@playwright/test";

const zippedShapefileFixturePath = path.resolve(process.cwd(), "sample-data/test-points-shapefile.zip");

test("loads the GeoPlus workspace shell", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/GeoPlus/i);
  await expect(page.getByRole("heading", { name: /GeoPlus/i })).toBeVisible();
  await expect(page.getByLabel("GeoPlus map")).toBeVisible();
  await expect(page.getByLabel("Hide sidebar")).toBeVisible();
});

test("opens the search panel from the map controls", async ({ page }) => {
  await page.goto("/");

  const searchToggle = page.getByLabel("Show search panel");
  await expect(searchToggle).toBeVisible();
  await searchToggle.click();

  await expect(page.getByLabel("Search places")).toBeVisible();
});

test("uploads a zipped shapefile and applies guided dataset filters", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /Add Data/i }).click();
  await page.locator("#dataset-upload").setInputFiles(zippedShapefileFixturePath);

  await expect(page.getByText("Shapefile parsed and ready to add.")).toBeVisible();
  await page.getByRole("button", { name: /^Add Layer$/i }).click();

  await expect(page.getByText("test-points-shapefile")).toBeVisible();

  await page.getByLabel("Tools").click();

  await expect(page.getByText("Rows in render set: 5")).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("Dataset Readiness", { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("Features: 5")).toBeVisible({ timeout: 20000 });
  await expect(page.locator("#duckdb-chart-column")).toHaveValue("segment", { timeout: 20000 });
  await expect(page.getByRole("button", { name: /active \(3\)/i })).toBeVisible();

  await page.getByRole("button", { name: /active \(3\)/i }).click();
  await expect(page.getByText("Rows in render set: 3")).toBeVisible({ timeout: 20000 });

  await page.getByRole("button", { name: /Create Analysis Layer/i }).click();
  await page.getByLabel("Layers").click();
  await expect(page.getByText(/test-points-shapefile Buffer 1 kilometers/i)).toBeVisible({ timeout: 20000 });
});
