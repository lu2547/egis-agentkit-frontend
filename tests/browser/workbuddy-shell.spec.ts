import { expect, test } from "@playwright/test";
const task = {
  session_id: "s1",
  agent_id: "a1",
  name: "整理行业研究与行动建议",
  definition_id: "expert-0",
  definition_display_name: "研究分析专家",
  updated_at: "2026-11-04T00:00:00Z",
  permission_mode: "default",
  model_key: "test",
};
test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
});
test("copied sidebar switches theme and keeps popup surfaces themed after reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "切换深色模式", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect
    .poll(() =>
      page
        .locator(".app-sidebar")
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    )
    .toBe("rgb(35, 35, 35)");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: `${task.name}的更多操作` }).click();
  await page.getByRole("button", { name: "重命名", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "重命名对话" });
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => dialog.evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe("rgb(25, 25, 25)");
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "切换浅色模式", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
test("conversation rename uses API and updates the open title and recent list", async ({
  page,
}) => {
  let current = { ...task };
  let saved = "";
  await page.route("**/api/manager/tasks", (route) =>
    route.fulfill({ json: { items: [current] } }),
  );
  await page.route("**/api/manager/tasks/s1", (route) =>
    route.fulfill({ json: current }),
  );
  await page.route("**/api/manager/tasks/s1/name", async (route) => {
    saved = route.request().postDataJSON().name;
    current = { ...current, name: saved };
    await route.fulfill({ json: current });
  });
  await page.goto("/tasks/s1");
  await page.getByRole("button", { name: `${task.name}的更多操作` }).click();
  await page.getByRole("button", { name: "重命名", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "重命名对话" });
  await dialog.getByLabel("对话名称").fill("养老险客户调研");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(saved).toBe("养老险客户调研");
  await expect(page.locator('.sidebar a[href="/tasks/s1"]')).toContainText(
    saved,
  );
  await expect(page.locator(".task-header h1")).toHaveText(saved);
});
test("sidebar search navigates real history and knowledge stays planned", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /知识库/ })).toBeDisabled();
  await page.getByRole("button", { name: "全局搜索", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "全局搜索" });
  await dialog.getByLabel("搜索历史对话").fill("行业研究");
  await dialog.getByRole("option").first().click();
  await expect(page).toHaveURL(/\/tasks\/s1$/);
});
