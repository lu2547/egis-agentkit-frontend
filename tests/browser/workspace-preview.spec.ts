import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const fixture = (name: string) =>
  readFileSync(resolve(process.cwd(), "tests/fixtures", name));
const files = ["preview.docx", "preview.xlsx"].map((name) => ({
  name,
  path: name,
  is_directory: false,
  size: fixture(name).length,
  modified_at: "2026-11-04T00:00:00Z",
}));

async function stubWorkspace(page: Page) {
  await page.route("**/api/manager/projects", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.items.push({ ...data.items[0], id: "project-2", project_name: "第二个项目" });
    await route.fulfill({ response, json: data });
  });
  await page.route("**/api/manager/tasks", (route) =>
    route.fulfill({
      json: {
        items: [
          { session_id: "s1", project_id: "project-1", name: "第一个对话", agent_id: "a1" },
          { session_id: "s2", project_id: "project-2", name: "另一个对话", agent_id: "a1" },
        ],
      },
    }),
  );
  await page.route("**/api/manager/projects/*/files?**", (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({
      json: { items: url.searchParams.get("area") === "uploads" ? files : [] },
    });
  });
  await page.route("**/api/manager/projects/*/file?**", (route) => {
    const path = new URL(route.request().url()).searchParams.get("path");
    const file = files.find((entry) => entry.path === path);
    if (!file)
      return route.fulfill({ status: 404, json: { detail: "not found" } });
    return route.fulfill({
      body: fixture(file.name),
      contentType: "application/octet-stream",
    });
  });
  await page.route(/\/api\/manager\/tasks\/s[12]$/, (route) => {
    const id = route.request().url().endsWith("/s1") ? "s1" : "s2";
    return route.fulfill({
      json: {
        session_id: id,
        project_id: id === "s1" ? "project-1" : "project-2",
        agent_id: "a1",
        name: id === "s1" ? "第一个对话" : "另一个对话",
        definition_id: "personal",
        definition_display_name: "个人助理",
        updated_at: "2026-11-04T00:00:00Z",
        plan:
          id === "s1"
            ? [
                { id: "1", subject: "核对业务资料", state: "in_progress" },
                { id: "2", subject: "整理结论", state: "completed" },
              ]
            : [],
      },
    });
  });
}

test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
  await stubWorkspace(page);
});

test("local DOCX and XLSX previews survive refresh and stay scoped to their project", async ({
  page,
}) => {
  await page.goto("/tasks/s1");
  const panel = page.locator(".workspace-panel");
  await expect(panel).toBeVisible();
  await panel.locator("button.file-open").filter({ hasText: /preview\.docx/ }).click();
  await expect(panel.locator(".office-document")).toContainText(
    "养老险业务文档预览",
  );

  await page.reload();
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "预览", exact: true }).click();
  await expect(panel.locator(".office-document")).toContainText(
    "养老险业务文档预览",
  );
  await page.locator('.sidebar a[href="/tasks/s2"]').click();
  await expect(page.locator(".task-header h1")).toHaveText("另一个对话");
  await panel.getByRole("button", { name: "预览", exact: true }).click();
  await expect(panel.locator(".office-document")).toHaveCount(0);
  await expect(panel.getByRole("heading", { name: "暂无预览" })).toBeVisible();

  await panel
    .locator(".workspace-tabs")
    .getByRole("button", { name: "文件", exact: true })
    .click();
  await panel
    .locator(".breadcrumb")
    .getByRole("button", { name: "工作空间", exact: true })
    .click();
  await panel.locator("button.file-open").filter({ hasText: /preview\.xlsx/ }).click();
  await expect(panel.getByLabel("选择工作表")).toHaveValue("0");
  await expect(panel.locator(".sheet-preview")).toContainText("客户清单");
  await expect(panel.locator(".sheet-preview")).toContainText("张三");
  await expect(panel.locator(".sheet-preview")).toContainText("1000");
});

test("plan panel shows canonical task DTO for the current conversation", async ({
  page,
}) => {
  await page.goto("/tasks/s1");
  const panel = page.locator(".workspace-panel");
  await panel.getByRole("button", { name: "计划", exact: true }).click();
  await expect(panel.locator(".plan")).toContainText("核对业务资料");
  await expect(panel.locator(".plan")).toContainText("进行中");
  await expect(panel.locator(".plan")).toContainText("整理结论");
  await expect(panel.locator(".plan")).toContainText("已完成");
  await page.locator('.sidebar a[href="/tasks/s2"]').click();
  await expect(page.locator(".task-header h1")).toHaveText("另一个对话");
  await panel.getByRole("button", { name: "计划", exact: true }).click();
  await expect(panel.locator(".plan")).toContainText("暂无计划");
  await expect(panel.locator(".plan")).not.toContainText("核对业务资料");
});
