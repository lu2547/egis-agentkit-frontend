import { expect, test } from "@playwright/test";
import { AssistantMsg, UserMsg } from "@agentscope-ai/agentscope/message";

const api = process.env.AGENTKIT_TEST_API_URL || "http://127.0.0.1:38194";
const headers = { Authorization: "Bearer test-only" };
const notice = "当前回复已结束，队列消息将在下一轮执行";
test.beforeEach(async ({ page, request }) => {
  await request.post(api + "/__test/reset");
  await page.addInitScript(() => sessionStorage.setItem("egis_access_token", "test-only"));
});

test("restored guidance stays above the full reply instead of following its delivery", async ({ page, request }) => {
  await request.post(api + "/__test/messages", { data: {
    session_id: "s1", messages: [
      UserMsg({ id: "question", content: "是的就是这个意思" }),
      AssistantMsg({ id: "guided-reply", finished_at: "2026-11-25T15:56:39Z", content: [
        { id: "output", type: "text", text: "完成合并，产物 merged-risk.txt" },
        { id: "short:0", type: "hint", source: "chat_input_steering", hint: "不过是嫌长" },
        { id: "verbose:0", type: "hint", source: "chat_input_steering", hint: "就是有点啰嗦" },
      ] }),
    ],
  } });
  for (let reload = 0; reload < 2; reload++) {
    await page.goto("/tasks/s1");
    await expect(page.locator(".user-message").filter({ hasText: "不过是嫌长" })).toContainText("已接收");
    await expect(page.locator(".user-message").filter({ hasText: "就是有点啰嗦" })).toHaveCount(1);
    const ids = await page.locator(".message-entry[data-message-id]").evaluateAll(entries => entries.map(entry => entry.getAttribute("data-message-id")));
    expect(ids.indexOf("short:0")).toBeLessThan(ids.indexOf("guided-reply"));
    expect(ids.indexOf("verbose:0")).toBeLessThan(ids.indexOf("guided-reply"));
  }
});

for (const transition of ["empty", "started"] as const) {
  test(`next-round queue notice disappears when ${transition === "empty" ? "the queue empties" : "execution starts"}`, async ({ page, request }) => {
    await page.goto("/tasks/s1");
    await page.locator(".composer textarea").fill("长任务：整理文档");
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect(page.getByRole("button", { name: "停止生成", exact: true })).toBeVisible();
    await page.locator(".composer textarea").fill("不过是嫌长");
    await page.getByRole("button", { name: "加入引导队列" }).click();
    const snapshot = await request.get(api + "/chat/queue?session_id=s1&agent_id=a1", { headers });
    const item = (await snapshot.json()).items[0];
    await request.post(api + "/__test/events", { data: {
      session_id: "s1", events: [{ type: "REPLY_END", finished_reason: "completed" }],
    } });
    await expect(page.getByRole("button", { name: "停止生成", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "发送第 1 条引导" }).click();
    await expect(page.getByText(notice, { exact: true })).toBeVisible();
    if (transition === "empty") {
      await request.delete(api + `/chat/queue/${item.id}?session_id=s1&agent_id=a1`, { headers });
    } else {
      await request.post(api + "/__test/events", { data: {
        session_id: "s1", events: [
          { type: "CUSTOM", name: "chat_input_started", value: { queue_item_id: item.id, queue_item: item } },
          { type: "REPLY_START", reply_id: "next-reply", role: "assistant", name: "assistant" },
        ],
      } });
    }
    await expect(page.getByText(notice, { exact: true })).toHaveCount(0);
    if (transition === "started") {
      await request.post(api + "/__test/events", { data: {
        session_id: "s1", events: [{ type: "REPLY_END", reply_id: "next-reply", finished_reason: "completed" }],
      } });
      await expect(page.getByText(notice, { exact: true })).toHaveCount(0);
    }
  });
}
