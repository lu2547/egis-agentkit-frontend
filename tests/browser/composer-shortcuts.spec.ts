import { expect, test } from "@playwright/test";

for (const shortcut of ["Alt+Enter", "Control+Enter"]) {
  test(`Windows ${shortcut} starts a conversation and queues subsequent guidance`, async ({ page, request }) => {
    await request.post("http://127.0.0.1:38194/__test/reset");
    await page.addInitScript(() => {
      sessionStorage.setItem("egis_access_token", "test-only");
      Object.defineProperty(navigator, "platform", { get: () => "Win32" });
    });
    const injections: string[] = [];
    page.on("request", request => {
      if (request.url().endsWith("/steer")) injections.push(request.url());
    });
    await page.goto("/");
    const input = page.locator(".composer > .t-textarea textarea");
    await input.fill("长任务：快捷键开始会话");
    await input.press(shortcut);
    await expect(page).toHaveURL("/tasks/s2");
    await expect(page.locator(".user-message-bubble > p")).toHaveText("长任务：快捷键开始会话");
    await expect(page.getByRole("button", { name: "停止生成", exact: true })).toBeVisible();
    await input.fill("补充要求：优先检查材料");
    await input.press(shortcut);
    await expect(page.locator(".steering-queue-row")).toHaveText(/补充要求：优先检查材料/);
    await expect(input).toHaveValue("");
    await expect(page.locator(".user-message")).toHaveCount(1);
    expect(injections).toEqual([]);
  });
}
