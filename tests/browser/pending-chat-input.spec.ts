import { expect, test } from "@playwright/test";

test("an ordinary queued send appears once and starts when the preceding run releases it", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
  let pending: unknown[] = [];
  let posted: Record<string, unknown>;
  let queueReads = 0;
  await page.route("**/api/chat/", async (route) => {
    posted = route.request().postDataJSON();
    pending = [
      {
        id: "ordinary",
        created_at: new Date().toISOString(),
        state: "queued",
        input: posted.input,
      },
    ];
    await route.fulfill({
      json: { status: "queued", session_id: "s1", queue_item_id: "ordinary" },
    });
  });
  await page.route(/\/api\/chat\/queue\?/, async (route) => {
    queueReads++;
    await route.fulfill({ json: { items: pending } });
  });
  await page.goto("/tasks/s1");
  await expect.poll(() => queueReads).toBeGreaterThan(0);
  await page.locator(".composer textarea").fill("查知识库啊");
  const readsBeforeSend = queueReads;
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.locator(".user-message-bubble > p")).toHaveText("查知识库啊");
  await expect(page.locator(".assistant-preparing")).toContainText("准备中");
  await expect
    .poll(() => queueReads, { timeout: 10000 })
    .toBeGreaterThan(readsBeforeSend);
  await expect(page.locator(".assistant-preparing")).toContainText(
    "排队等待执行",
  );
  await expect(page.locator(".steering-queue-row")).toHaveCount(0);
  pending = [];
  await request.post("http://127.0.0.1:38194/chat/", {
    headers: { Authorization: "Bearer test-only" },
    data: posted!,
  });
  await expect(page.locator(".assistant-preparing")).toHaveCount(0);
  await expect(page.locator(".assistant-message")).toContainText(
    "已完成研究简报",
  );
  await expect(page.locator(".user-message")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "停止生成", exact: true }),
  ).toHaveCount(0);
});
