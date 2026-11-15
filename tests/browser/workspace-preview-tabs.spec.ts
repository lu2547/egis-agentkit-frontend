import { test, expect } from "@playwright/test";
const api = "http://127.0.0.1:38194";
test.beforeEach(async ({ page, request }) => {
  await request.post(`${api}/__test/reset`);
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
  await page.route("**/api/manager/projects/project-1/files?**", (route) =>
    route.fulfill({
      json: {
        items: ["first.txt", "second.txt"].map((name) => ({
          name,
          path: name,
          size: 20,
          is_directory: false,
        })),
      },
    }),
  );
  await page.route("**/api/manager/projects/project-1/file?**", (route) =>
    route.fulfill({
      contentType: "text/plain",
      body:
        new URL(route.request().url()).searchParams.get("path") + " content",
    }),
  );
});
test("preview tabs keep multiple files, deduplicate and restore after reload", async ({
  page,
}) => {
  await page.goto("/tasks/s1");
  const panel = page.locator(".workspace-panel");
  const nav = panel.getByRole("navigation", { name: "工作空间面板" });
  await expect(
    nav.getByRole("button", { name: "产物", exact: true }),
  ).toHaveCount(0);
  await panel.locator(".file-open").filter({ hasText: "first.txt" }).click();
  await expect(
    panel.getByRole("tab", { name: "first.txt", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(panel.getByRole("button", { name: /返回/ })).toHaveCount(0);
  await expect(panel.locator(".file-preview > header")).toHaveCount(0);
  await nav.getByRole("button", { name: "文件", exact: true }).click();
  await panel.locator(".file-open").filter({ hasText: "second.txt" }).click();
  await expect(panel.getByRole("tab")).toHaveCount(2);
  await expect(panel.locator(".file-preview:visible .text-preview")).toHaveText(
    "second.txt content",
  );
  await panel.getByRole("tab", { name: "first.txt", exact: true }).click();
  await expect(panel.locator(".file-preview:visible .text-preview")).toHaveText(
    "first.txt content",
  );
  await nav.getByRole("button", { name: "文件", exact: true }).click();
  await panel.locator(".file-open").filter({ hasText: "first.txt" }).click();
  await expect(panel.getByRole("tab")).toHaveCount(2);
  await page.reload();
  await expect(panel.getByRole("tab")).toHaveCount(2);
  await expect(
    panel.getByRole("tab", { name: "first.txt", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await panel
    .getByRole("button", { name: "关闭预览 first.txt", exact: true })
    .click();
  await expect(
    panel.getByRole("tab", { name: "second.txt", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(panel.locator(".file-preview:visible .text-preview")).toHaveText(
    "second.txt content",
  );
});

test("file-tab keyboard navigation and close are scoped to the current conversation", async ({
  page,
  request,
}) => {
  await request.post(`${api}/manager/tasks`, {
    headers: { Authorization: "Bearer test-only" },
    data: {
      project_id: "project-1",
      definition_id: "personal",
      resource_view_type: "private",
      name: "第二个对话",
    },
  });
  await page.goto("/tasks/s1");
  const panel = page.locator(".workspace-panel");
  await panel.locator(".file-open").filter({ hasText: "first.txt" }).click();
  await panel
    .getByRole("navigation", { name: "工作空间面板" })
    .getByRole("button", { name: "文件", exact: true })
    .click();
  await panel.locator(".file-open").filter({ hasText: "second.txt" }).click();
  const second = panel.getByRole("tab", { name: "second.txt", exact: true });
  await second.focus();
  await second.press("ArrowLeft");
  await expect(
    panel.getByRole("tab", { name: "first.txt", exact: true }),
  ).toBeFocused();
  await expect(
    panel.getByRole("tab", { name: "first.txt", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.locator('.sidebar a[href="/tasks/s2"]').click();
  await expect(panel.getByRole("tab")).toHaveCount(0);
  await page.locator('.sidebar a[href="/tasks/s1"]').click();
  await expect(panel.getByRole("tab")).toHaveCount(2);
  await expect(
    panel.getByRole("tab", { name: "first.txt", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});
