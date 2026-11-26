import { expect, test } from "@playwright/test";
import { AssistantMsg, UserMsg } from "@agentscope-ai/agentscope/message";

const api = process.env.AGENTKIT_TEST_API_URL || "http://127.0.0.1:38194";
const headers = { Authorization: "Bearer test-only" };
const notice = "当前回复已结束，队列消息将在下一轮执行";
test.beforeEach(async ({ page, request }) => {
  await request.post(api + "/__test/reset");
  await page.addInitScript(() => sessionStorage.setItem("egis_access_token", "test-only"));
});

test("restored guidance precedes only its subsequent work and final delivery", async ({ page, request }) => {
  await request.post(api + "/__test/messages", { data: {
    session_id: "s1", messages: [
      UserMsg({ id: "question", content: "是的就是这个意思" }),
      AssistantMsg({ id: "guided-reply", finished_at: "2026-11-25T15:56:39Z", content: [
        { id: "initial", type: "thinking", thinking: "先检查材料" },
        { id: "short:0", type: "hint", source: "chat_input_steering", hint: "不过是嫌长" },
        { id: "shortened", type: "thinking", thinking: "精简内容" },
        { id: "verbose:0", type: "hint", source: "chat_input_steering", hint: "就是有点啰嗦" },
        { id: "output", type: "text", text: "完成合并，产物 merged-risk.txt" },
      ] }),
    ],
  } });
  for (let reload = 0; reload < 2; reload++) {
    await page.goto("/tasks/s1");
    await expect(page.locator(".user-message").filter({ hasText: "不过是嫌长" })).toContainText("已接收");
    await expect(page.locator(".user-message").filter({ hasText: "就是有点啰嗦" })).toHaveCount(1);
    const ids = await page.locator(".message-entry[data-message-id]").evaluateAll(entries => entries.map(entry => entry.getAttribute("data-message-id")));
    expect(ids.indexOf("guided-reply")).toBeLessThan(ids.indexOf("short:0"));
    expect(ids.indexOf("short:0")).toBeLessThan(ids.indexOf("verbose:0"));
    expect(ids.indexOf("verbose:0")).toBeLessThan(ids.lastIndexOf("guided-reply"));
    await expect(page.getByLabel("回复操作", { exact: true })).toHaveCount(1);
  }
});

test("sent guidance is pending receipt until a hint, then its continuation appears underneath", async ({ page, request }) => {
  await page.goto("/tasks/s1");
  await page.locator(".composer textarea").fill("长任务：修改文档");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.getByRole("button", { name: "停止生成", exact: true })).toBeVisible();
  await request.post(api + "/__test/events", { data: { session_id: "s1", events: [
    { type: "THINKING_BLOCK_START", block_id: "old-work" },
    { type: "THINKING_BLOCK_DELTA", block_id: "old-work", delta: "原始材料检查" },
    { type: "THINKING_BLOCK_END", block_id: "old-work" },
  ] } });
  await page.locator(".composer textarea").fill("改成蓝色");
  await page.getByRole("button", { name: "加入引导队列" }).click();
  const queued = await request.get(api + "/chat/queue?session_id=s1&agent_id=a1", { headers });
  const item = (await queued.json()).items[0];
  let sent = false;
  await page.route("**/api/chat/queue?**", async route => {
    const response = await route.fetch();
    const data = await response.json();
    if (sent) data.items = data.items.map((entry: { id: string }) => entry.id === item.id ? { ...entry, state: "steering" } : entry);
    await route.fulfill({ json: data });
  });
  await page.route("**/api/chat/queue/*/steer", async route => {
    sent = true;
    await route.fulfill({ json: { items: [{ ...item, state: "steering" }] } });
  });
  await page.getByRole("button", { name: "发送第 1 条引导" }).click();
  const bubble = page.locator(".user-message").filter({ hasText: "改成蓝色" });
  await expect(bubble).toContainText("待接收");
  await expect(page.locator(".steering-queue-row")).toHaveCount(0);
  await expect(page.locator(".message-entry").last()).toContainText("改成蓝色");
  await request.post(api + "/__test/events", { data: { session_id: "s1", events: [
    { type: "HINT_BLOCK", block_id: `${item.id}:0`, source: "chat_input_steering", hint: item.input.content },
    { type: "THINKING_BLOCK_START", block_id: "new-work" },
    { type: "THINKING_BLOCK_DELTA", block_id: "new-work", delta: "蓝色版本整理" },
  ] } });
  await expect(bubble).toContainText("已接收");
  await expect(page.locator(".assistant-message:not(.assistant-preparing)")).toHaveCount(2);
  const roles = await page.locator(".message-entry").evaluateAll(entries => entries.map(entry => entry.querySelector(".user-message") ? "user" : "assistant"));
  expect(roles).toEqual(["user", "assistant", "user", "assistant"]);
  await expect(page.getByLabel("回复操作", { exact: true })).toHaveCount(0);
});

test("memory processing is named explicitly during events and after reload, then clears when finished", async ({ page, request }) => {
  let memory = false;
  await page.route("**/api/manager/tasks/s1", async route => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ json: { ...data, execution_phase: memory ? { session_id: "s1", reply_id: "memory-reply", phase: "memory" } : null } });
  });
  await page.goto("/tasks/s1");
  await page.locator(".composer textarea").fill("长任务：整理材料");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.getByRole("button", { name: "停止生成", exact: true })).toBeVisible();
  await page.locator(".composer textarea").fill("补充一个要求");
  await page.getByRole("button", { name: "加入引导队列" }).click();
  memory = true;
  await request.post(api + "/__test/events", { data: { session_id: "s1", events: [
    { type: "REPLY_END", finished_reason: "completed" },
    { type: "CUSTOM", name: "session_execution_phase", value: { session_id: "s1", reply_id: "memory-reply", phase: "memory" } },
  ] } });
  await expect(page.getByRole("status").filter({ hasText: /^记忆整理中$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "发送第 1 条引导" })).toBeDisabled();
  await expect(page.locator(".steering-queue")).toContainText("记忆整理中，待发消息将在整理完成后执行");
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: /^记忆整理中$/ })).toBeVisible();
  memory = false;
  await request.post(api + "/__test/events", { data: { session_id: "s1", events: [
    { type: "CUSTOM", name: "session_execution_phase", value: { session_id: "s1", reply_id: "memory-reply", phase: null } },
  ] } });
  await expect(page.getByRole("status").filter({ hasText: /^记忆整理中$/ })).toHaveCount(0);
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
    await expect(page.getByRole("button", { name: "发送第 1 条引导" })).toBeDisabled();
    await expect(page.locator(".steering-queue")).toContainText("当前回复已结束，待发消息将在下一轮执行");
    await expect(page.getByText(notice, { exact: true })).toHaveCount(0);
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
