import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const pdf = readFileSync(resolve("tests/fixtures/preview.pdf"));
test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
});
for (const name of [
  "preview.pdf",
  "preview.pptx",
  "preview.doc",
  "preview.xls",
]) {
  test(`local document viewer renders ${name} without a PDF plugin`, async ({
    page,
  }) => {
    await page.route("**/api/manager/projects/project-1/files**", (route) =>
      route.fulfill({
        json: {
          items: [
            {
              name,
              path: name,
              is_directory: false,
              size: pdf.length,
              modified_at: "",
            },
          ],
        },
      }),
    );
    await page.route("**/api/manager/projects/project-1/file?**", (route) =>
      route.fulfill({
        body: name.endsWith(".pdf") ? pdf : Buffer.from("office input"),
        contentType: name.endsWith(".pdf")
          ? "application/pdf"
          : "application/octet-stream",
      }),
    );
    let conversions = 0;
    await page.route(
      "**/api/manager/projects/project-1/preview?**",
      (route) => {
        conversions++;
        return route.fulfill({ body: pdf, contentType: "application/pdf" });
      },
    );
    await page.goto("/tasks/s1");
    const panel = page.locator(".workspace-panel");
    await panel
      .locator("button.file-open").filter({ hasText: name })
      .click();
    const canvas = panel.locator("canvas");
    await expect(canvas).toBeVisible();
    await expect(panel.locator(".pdf-pages")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    expect(
      await canvas.evaluate((element: HTMLCanvasElement) => element.width),
    ).toBeGreaterThan(100);
    await expect(
      panel.getByRole("navigation", { name: "PDF 翻页和缩放" }),
    ).toContainText("1 / 2");
    await panel.getByRole("button", { name: "下一页", exact: true }).click();
    await expect(
      panel.getByRole("navigation", { name: "PDF 翻页和缩放" }),
    ).toContainText("2 / 2");
    await expect(panel.locator("iframe")).toHaveCount(0);
    expect(conversions).toBe(name.endsWith(".pdf") ? 0 : 1);
  });
}
test("code preview treats source as text and keeps HTML scripts isolated", async ({
  page,
}) => {
  await page.route("**/api/manager/projects/project-1/files**", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            name: "example.java",
            path: "example.java",
            is_directory: false,
            size: 42,
            modified_at: "",
          },
        ],
      },
    }),
  );
  await page.route("**/api/manager/projects/project-1/file?**", (route) =>
    route.fulfill({
      body: 'public class Example { String value = "<script>bad()</script>"; }',
      contentType: "application/octet-stream",
    }),
  );
  await page.goto("/tasks/s1");
  await page
    .locator(".workspace-panel")
    .locator("button.file-open").filter({ hasText: /example\.java/ })
    .click();
  await expect(page.locator(".text-preview")).toContainText(
    "public class Example",
  );
  await expect(page.locator(".text-preview script")).toHaveCount(0);
});
