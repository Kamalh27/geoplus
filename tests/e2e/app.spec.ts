import path from "node:path";

import { expect, test } from "@playwright/test";

const zippedShapefileFixturePath = path.resolve(process.cwd(), "sample-data/test-points-shapefile.zip");
const cogFixturePath = path.resolve(process.cwd(), "sample-data/test.tif");




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

test("uploads a zipped shapefile and verifies the tools panel", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /Add Data/i }).click();
  await page.locator("#dataset-upload").setInputFiles(zippedShapefileFixturePath);

  await expect(page.getByText("Shapefile parsed and ready to add.")).toBeVisible();
  await page.getByRole("button", { name: /^Add Layer$/i }).click();

  await expect(page.getByText("Test points shapefile")).toBeVisible();

  await page.getByLabel("Tools").click();

  await expect(page.getByText("Select a tool to perform spatial operations")).toBeVisible();
  await page.getByRole("button", { name: "Filter Data Query and filter" }).click();

  await expect(page.getByText("Target Layer")).toBeVisible();
  await expect(page.getByText("SQL WHERE Clause")).toBeVisible();
});




test("uploads a COG file", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /Add Data/i }).click();
  await page.locator("#dataset-upload").setInputFiles(cogFixturePath);

  await expect(page.getByText("COG (Cloud Optimized GeoTIFF) ready to add.")).toBeVisible();
  await page.getByRole("button", { name: /^Add Layer$/i }).click();

  await expect(page.getByText("Test", { exact: true })).toBeVisible();
});

test("uploads a KML file", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /Add Data/i }).click();
  await page.locator("#dataset-upload").setInputFiles(path.resolve(process.cwd(), "sample-data/test.kml"));

  await expect(page.getByText("KML parsed and ready to add.")).toBeVisible();
  await page.getByRole("button", { name: /^Add Layer$/i }).click();

  await expect(page.getByText("Test", { exact: true })).toBeVisible();
});

test("uploads a KMZ file", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /Add Data/i }).click();
  await page.locator("#dataset-upload").setInputFiles(path.resolve(process.cwd(), "sample-data/test.kmz"));

  await expect(page.getByText("KMZ parsed and ready to add.")).toBeVisible();
  await page.getByRole("button", { name: /^Add Layer$/i }).click();

  await expect(page.getByText("Test", { exact: true })).toBeVisible();
});

test("uploads a Zarr file", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /Add Data/i }).click();
  await page.locator("#dataset-upload").setInputFiles(path.resolve(process.cwd(), "sample-data/test.zarr.zip"));

  await expect(page.getByText("Zarr archive parsed. Found variables: temperature. Ready to add.")).toBeVisible();
  await page.getByRole("button", { name: /^Add Layer$/i }).click();

  await expect(page.getByText("Test.zarr", { exact: true })).toBeVisible();
});
