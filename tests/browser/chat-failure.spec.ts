import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
});

test("failed replies stop processing and release the composer", async ({
  page,
  request,
}) => {
  await page.goto("/tasks/s1");
  await page.locator(".composer textarea").fill("长任务：失败收尾测试");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.locator(".running-dot")).toBeVisible();
  await request.post("http://127.0.0.1:38194/__test/events", {
    data: {
      session_id: "s1",
      events: [
        {
          type: "REPLY_END",
          finished_reason: "error",
          error: { type: "connection", message: "沙箱启动失败，请重试。" },
        },
      ],
    },
  });
  await expect(page.getByRole("alert")).toContainText("沙箱启动失败");
  await expect(page.locator(".running-dot")).toHaveCount(0);
  await expect(page.locator(".task-running")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "停止生成", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "发送消息", exact: true }),
  ).toBeVisible();
});

test("server idle state recovers a missing terminal event without spinning forever", async ({
  page,
}) => {
  let failed = false,
    replyId = "";
  await page.route("**/api/manager/tasks", async (route) => {
    const data = await (await route.fetch()).json();
    for (const task of data.items) {
      if (task.session_id === "s1") {
        replyId = task.activeReply || replyId;
        if (failed) task.is_running = false;
      }
    }
    await route.fulfill({ json: data });
  });
  await page.route("**/api/sessions/s1/messages?*", async (route) => {
    const data = await (await route.fetch()).json();
    if (failed)
      data.messages.push({
        id: replyId,
        role: "assistant",
        name: "研究分析专家",
        content: [],
        metadata: {},
        created_at: new Date().toISOString(),
      });
    await route.fulfill({ json: data });
  });
  await page.goto("/tasks/s1");
  await page.locator(".composer textarea").fill("长任务：结束事件丢失测试");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.locator(".running-dot")).toBeVisible();
  failed = true;
  await expect(page.getByRole("alert").first()).toContainText(
    "本次处理已中断",
    { timeout: 12000 },
  );
  await expect(page.locator(".running-dot")).toHaveCount(0);
  await expect(page.locator(".task-running")).toHaveCount(0);
  await page.locator(".composer textarea").fill("可以重新发送");
  await expect(
    page.getByRole("button", { name: "发送消息", exact: true }),
  ).toBeEnabled();
});
