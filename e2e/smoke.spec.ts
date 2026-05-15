import { expect, test } from "@playwright/test";

test("schema-only import generates sample data and runs in Query mode", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Import prompt/schema" }).click();
  await expect(page.getByRole("button", { name: "Setup" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByLabel("Import prompt").fill(
    [
      "orders Table:",
      "Column Name\tType",
      "order_id\tinteger",
      "status\tstring",
      "created_at\ttimestamp",
    ].join("\n"),
  );

  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("Generated sample data").first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("2024-01-01T09:00:00.000Z")).toBeVisible();

  await page.getByRole("button", { name: "Query" }).click();
  await expect(page.getByRole("button", { name: "Query" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.locator(".monaco-editor").first().click({ force: true });
  await page.keyboard.press("Control+A");
  await page.keyboard.type("SELECT COUNT(*) AS total FROM orders;");

  const runButton = page.getByRole("button", { name: "Run", exact: true });
  await expect(runButton).toBeEnabled({ timeout: 30_000 });
  await runButton.click();

  const countResult = page.getByRole("cell", { name: "12" });
  await expect(countResult).toBeVisible({ timeout: 15_000 });
});
