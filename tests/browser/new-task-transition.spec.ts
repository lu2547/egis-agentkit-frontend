import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
});

test("the first message stays visible through task, history and stream setup", async ({
  page,
}) => {
  const gates = ["task", "history", "stream"].map((name) => {
    let release!: () => void;
    let started!: () => void;
    return {
      name,
      waiting: new Promise<void>((resolve) => (started = resolve)),
      gate: new Promise<void>((resolve) => (release = resolve)),
      started: () => started(),
      release: () => release(),
    };
  });
  const urls = [
    "**/api/manager/tasks/s2",
    "**/api/sessions/s2/messages?**",
    "**/api/sessions/s2/stream?**",
  ];
  for (const [index, url] of urls.entries()) {
    const gate = gates[index]!;
    await page.route(url, async (route) => {
      gate.started();
      await gate.gate;
      await route.continue().catch(() => {});
    });
  }
  const sent: { input: { id: string } }[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/chat/")) sent.push(request.postDataJSON());
  });
  await page.goto("/");
  await expect(page.locator(".welcome")).toBeVisible();
  await page.locator(".composer textarea").fill("长任务：只进入一次对话页面");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  let messageId = "";
  try {
    for (const gate of gates) {
      await gate.waiting;
      await expect(page).toHaveURL("/tasks/s2");
      await expect(page.locator(".user-message-bubble > p")).toHaveText(
        "长任务：只进入一次对话页面",
      );
      await expect(page.locator(".assistant-preparing")).toContainText(
        "准备中",
      );
      await expect(
        page.locator(".loading-chat, .connection-note, .message-list > .empty"),
      ).toHaveCount(0);
      await expect(page.locator(".task-header h1")).toHaveText("新的工作任务");
      await expect(page.locator(".workspace-panel")).not.toBeVisible();
      const id = await page
        .locator(".message-entry")
        .first()
        .getAttribute("data-message-id");
      messageId ||= id!;
      expect(id, gate.name).toBe(messageId);
      expect(sent, gate.name).toHaveLength(0);
      gate.release();
    }
    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0]!.input.id).toBe(messageId);
    await expect(page.locator(".user-message")).toHaveCount(1);
    await expect(page.locator(".assistant-preparing")).toHaveCount(0);
    await expect(page.locator(".latest-activity")).toContainText("正在思考");
  } finally {
    gates.forEach((gate) => gate.release());
  }
});

test("a rejected first message returns to the composer and retries in the same conversation", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/chat/", (route) => {
    attempts++;
    return attempts === 1
      ? route.fulfill({ status: 503, json: { detail: "请求未接受" } })
      : route.continue();
  });
  await page.goto("/");
  const text = "长任务：失败后重试首条消息";
  await page.locator(".composer textarea").fill(text);
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page).toHaveURL("/tasks/s2");
  await expect(page.getByRole("alert")).toContainText("请求未接受");
  await expect(page.locator(".user-message, .assistant-preparing")).toHaveCount(
    0,
  );
  await expect(page.locator(".composer textarea")).toHaveValue(text);
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.locator(".user-message-bubble > p")).toHaveText(text);
  await expect(page.locator(".latest-activity")).toContainText("正在思考");
  expect(attempts).toBe(2);
  await expect(page).toHaveURL("/tasks/s2");
});

test("a new conversation keeps the project workspace open when it was already open", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/manager/tasks/s2", async (route) => {
    await gate;
    await route.continue().catch(() => {});
  });
  await page.goto("/projects/project-1");
  await expect(page.locator(".workspace-panel")).toBeVisible();
  await page.locator(".composer textarea").fill("长任务：继续在项目里处理");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  try {
    await expect(page).toHaveURL("/tasks/s2");
    await expect(page.locator(".user-message-bubble > p")).toHaveText(
      "长任务：继续在项目里处理",
    );
    await expect(page.locator(".workspace-panel")).toBeVisible();
    await expect(page.locator(".task-header")).toContainText("行业研究");
  } finally {
    release();
  }
});
