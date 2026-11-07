import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
});

test("brand and personal assistant settings live inside experts", async ({
  page,
}) => {
  await page.goto("/experts");
  await expect(page).toHaveTitle("养老险GPT");
  await expect(page.locator(".brand img")).toHaveAttribute("alt", "养老险GPT");
  await page.getByRole("button", { name: "个人助理", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "个人助理", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("tab", { name: /agent.md.*工作范围/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: /soul.md.*决策风格/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: /user.md.*业务背景/ }),
  ).toBeVisible();
  await expect(
    page.locator(".sidebar").getByRole("link", { name: "个人助理设置" }),
  ).toHaveCount(0);
});

test("deleting a conversation refreshes sidebar and retains workspace wording", async ({
  page,
}) => {
  let deleted = false;
  await page.route("**/api/manager/tasks", (route) =>
    route.fulfill({
      json: {
        items: deleted
          ? []
          : [
              {
                session_id: "s1",
                agent_id: "a1",
                name: "整理行业研究与行动建议",
                definition_id: "expert-0",
                definition_display_name: "研究分析专家",
                updated_at: "2026-11-04T00:00:00Z",
              },
            ],
      },
    }),
  );
  await page.route("**/api/manager/tasks/s1", async (route) => {
    if (route.request().method() === "DELETE") {
      deleted = true;
      await route.fulfill({ status: 204 });
    } else await route.continue();
  });
  await page.goto("/");
  await expect(page.getByText("最近对话", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "整理行业研究与行动建议的更多操作" })
    .click();
  await page
    .getByRole("button", { name: "删除对话：整理行业研究与行动建议" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText(/上传资料.*过程文件.*产物.*变更记录都会保留/),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "删除对话", exact: true }).click();
  await expect(page.locator('.sidebar a[href="/tasks/s1"]')).toHaveCount(0);
  expect(deleted).toBe(true);
});

test("native session naming refreshes the conversation heading and sidebar", async ({
  page,
}) => {
  await page.goto("/tasks/s1");
  await page
    .getByPlaceholder("今天帮你做些什么？@ 添加上下文，/调用技能与指令。")
    .fill("测试对话命名，请整理养老险客户服务方案");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.locator(".task-header h1")).toHaveText(
    "养老险客户服务方案",
  );
  await expect(page.locator('.sidebar a[href="/tasks/s1"]')).toContainText(
    "养老险客户服务方案",
  );
});
