import { expect, test, type Page } from "@playwright/test";

async function runSeededSolution(page: Page, title: string) {
  await page.getByRole("button", { name: /Practice with sample data/i }).click();
  await page.getByRole("button", { name: `Open ${title}` }).click();
  await page.getByRole("button", { name: "Reveal solution", exact: true }).click();
  await page.getByRole("button", { name: "Run", exact: true }).click();
}

test("Airbnb seeded exercise returns the documented neighborhood pricing result", async ({
  page,
}) => {
  await page.goto("/");
  await runSeededSolution(page, "Average Price by Neighborhood");
  const results = page.locator(".workspace-query-column table").last();

  await expect(results.getByRole("cell", { name: "Mission" })).toBeVisible();
  await expect(results.getByRole("cell", { name: "Williamsburg" })).toBeVisible();
  await expect(results.getByRole("cell", { name: /^3$/ })).toBeVisible();
  await expect(results.getByRole("cell", { name: /^2$/ })).toBeVisible();
});

test("Stripe seeded exercise returns the documented running total result", async ({
  page,
}) => {
  await page.goto("/");
  await runSeededSolution(page, "Daily Revenue With Running Total");
  const results = page.locator(".workspace-query-column table").last();

  await expect(results.getByRole("cell", { name: /^150$/ })).toBeVisible();
  await expect(results.getByRole("cell", { name: /^275$/ })).toBeVisible();
  await expect(results.getByRole("cell", { name: /^405$/ })).toBeVisible();
});

test("LinkedIn seeded exercise returns the documented direct report counts", async ({
  page,
}) => {
  await page.goto("/");
  await runSeededSolution(page, "Direct Reports Per Manager");
  const results = page.locator(".workspace-query-column table").last();

  await expect(results.getByRole("cell", { name: "Ruth" })).toBeVisible();
  await expect(results.getByRole("cell", { name: "Sundar" })).toBeVisible();
  await expect(results.getByRole("cell", { name: "Sanjay" })).toBeVisible();
  await expect(results.getByRole("cell", { name: /^2$/ }).first()).toBeVisible();
  await expect(results.getByRole("cell", { name: /^1$/ })).toBeVisible();
});
