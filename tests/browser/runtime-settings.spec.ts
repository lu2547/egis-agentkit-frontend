import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
});

test("home sends the chosen native permission mode when creating a task", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("permission-mode-trigger")).toHaveAttribute(
    "data-value",
    "bypass",
  );
  await page.getByTestId("permission-mode-trigger").click();
  await page
    .locator('[role="menuitemradio"][data-mode="accept_edits"]')
    .click();
  const request = page.waitForRequest(
    (r) => r.url().endsWith("/manager/tasks") && r.method() === "POST",
  );
  await page.locator(".composer textarea").fill("整理研究");
  await page.getByRole("button", { name: "发送消息" }).click();
  expect((await request).postDataJSON().permission_mode).toBe("accept_edits");
});

test("home locks permission selection while task creation is pending", async ({
  page,
}) => {
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/manager/tasks", async (route) => {
    if (route.request().method() === "POST") await waiting;
    await route.continue();
  });
  await page.goto("/");
  await page.locator(".composer textarea").fill("创建中的权限选择");
  await page.getByRole("button", { name: "发送消息" }).click();
  try {
    await expect(page.getByTestId("permission-mode-trigger")).toBeDisabled();
  } finally {
    release();
  }
  await expect(page).toHaveURL(/\/tasks\//);
});

test("session settings persist through native PATCH and allow full access", async ({
  page,
}) => {
  await page.goto("/tasks/s1");
  const mode = page.getByTestId("permission-mode-trigger");
  await mode.click();
  await expect(
    page.locator('[role="menuitemradio"][data-mode="bypass"]'),
  ).toBeEnabled();
  const request = page.waitForRequest(
    (r) =>
      r.url().endsWith("/manager/tasks/s1/settings") && r.method() === "PATCH",
  );
  await page.locator('[role="menuitemradio"][data-mode="bypass"]').click();
  expect((await request).postDataJSON().permission_mode).toBe("bypass");
  await expect(mode).toHaveAttribute("data-value", "bypass");
  await page.reload();
  await expect(mode).toHaveAttribute("data-value", "bypass");
});

test("session model selection saves the actual model key", async ({ page }) => {
  await page.goto("/tasks/s1");
  const model = page.getByLabel("模型");
  await expect(model).toHaveAttribute("data-value", "test");
  const request = page.waitForRequest(
    (r) =>
      r.url().endsWith("/manager/tasks/s1/settings") && r.method() === "PATCH",
  );
  await model.click();
  await page.getByRole("option", { name: "快速模型", exact: true }).click();
  expect((await request).postDataJSON().model_key).toBe("test-alt");
  await page.reload();
  await expect(model).toHaveAttribute("data-value", "test-alt");
});

test("permission mode remains selectable while waiting for tool approval", async ({
  page,
}) => {
  await page.goto("/tasks/s1");
  await page.locator(".composer textarea").fill("测试确认");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.getByText("需要你的确认")).toBeVisible();
  const mode = page.getByTestId("permission-mode-trigger");
  await expect(mode).toBeEnabled();
  await mode.click();
  await page.locator('[role="menuitemradio"][data-mode="bypass"]').click();
  await expect(mode).toHaveAttribute("data-value", "bypass");
  await expect(page.getByLabel("模型", { exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "允许此次操作" }),
  ).toBeVisible();
});

test("failed session update retains the persisted mode", async ({ page }) => {
  await page.route("**/api/manager/tasks/s1/settings", (route) =>
    route.fulfill({ status: 500, json: { detail: "设置保存失败" } }),
  );
  await page.goto("/tasks/s1");
  const mode = page.getByTestId("permission-mode-trigger");
  await expect(mode).toHaveAttribute("data-value", "default");
  await mode.click();
  await page.locator('[role="menuitemradio"][data-mode="explore"]').click();
  await expect(page.getByText("设置保存失败")).toBeVisible();
  await expect(mode).toHaveAttribute("data-value", "default");
});

test("permission popup explains all native modes and supports keyboard dismissal", async ({
  page,
}) => {
  await page.goto("/");
  const trigger = page.getByTestId("permission-mode-trigger");
  await trigger.focus();
  await trigger.press("ArrowDown");
  const menu = page.getByRole("menu", { name: "权限模式选项" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitemradio")).toHaveCount(4);
  await expect(menu.locator('[data-mode="bypass"]')).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(menu.locator('[data-mode="dont_ask"]')).toHaveCount(0);
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "了解更多" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText(
      "权限模式只决定何时请求批准，仍受你已获授权的技能、连接器和资源范围限制。",
    ),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.press("ArrowUp");
  await expect(menu.locator('[data-mode="bypass"]')).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("data-value", "bypass");
  await trigger.click();
  await page.getByRole("link", { name: "养老险GPT", exact: true }).click();
  await expect(menu).not.toBeVisible();
});

for (const theme of ["light", "dark"] as const) {
  test(`model picker follows the WorkBuddy menu in ${theme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("/tasks/s1");
    const model = page.getByLabel("模型", { exact: true });
    await model.click();
    const menu = page.getByRole("listbox", { name: "可用模型" });
    await expect(menu).toBeVisible();
    await expect(
      menu.getByRole("option", { name: "工作模型", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowDown");
    await expect(
      menu.getByRole("option", { name: "快速模型", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).not.toBeVisible();
    await expect(model).toBeFocused();
  });
}
