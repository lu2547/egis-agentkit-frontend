import { expect, test } from "@playwright/test";
const api = process.env.AGENTKIT_TEST_API_URL || "http://127.0.0.1:38194";
test.beforeEach(async ({ page, request }) => {
  await request.post(api + "/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
});

test("a queued supplement stays in the composer until explicitly sent as guidance", async ({ page, request }) => {
  await page.goto("/tasks/s1");
  await page.locator(".composer textarea").fill("长任务：ABC 是啥呀？");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.getByRole("button", { name: "停止生成", exact: true })).toBeVisible();
  await page.locator(".composer textarea").fill("没看懂");
  await page.getByRole("button", { name: "加入引导队列" }).click();
  const bubble = page.locator(".user-message").filter({ hasText: "没看懂" });
  await expect(page.getByText("没看懂", { exact: true })).toHaveCount(1);
  await expect(bubble).toHaveCount(0);
  const row = page.locator(".composer .steering-queue-row");
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "编辑第 1 条引导" }).click();
  await row.getByLabel("第 1 条引导内容").fill("没看懂，请再讲一次");
  await row.getByLabel("第 1 条引导内容").press("Enter");
  await expect(page.getByText("没看懂，请再讲一次", { exact: true })).toHaveCount(1);
  await page.reload();
  await expect(page.getByText("没看懂，请再讲一次", { exact: true })).toHaveCount(1);
  await expect(row).toHaveCount(1);
  await expect(bubble).toHaveCount(0);
  const replyId = await page.locator(".message-entry").filter({ has: page.locator(".assistant-message") }).last().getAttribute("data-message-id");
  await row.getByRole("button", { name: "发送第 1 条引导" }).click();
  await expect(bubble).toContainText("已接收");
  await expect(row).toHaveCount(0);
  await expect(page.getByText("没看懂，请再讲一次", { exact: true })).toHaveCount(1);
  const beforeReply = () => page.locator(".message-entry[data-message-id]").evaluateAll((entries, replyId) => {
    const ids = entries.map(entry => entry.getAttribute("data-message-id"));
    const guidance = entries.findIndex(entry => entry.textContent?.includes("没看懂，请再讲一次"));
    return guidance >= 0 && guidance < ids.indexOf(replyId);
  }, replyId);
  await expect.poll(beforeReply).toBe(true);
  await request.post(api + "/__test/events", { data: {
    session_id: "s1", events: [{ type: "REPLY_END", finished_reason: "completed" }],
  } });
  await expect.poll(beforeReply).toBe(true);
});

test("queued supplement stays editable below until explicit steering and native confirmation", async ({
  page,
  request,
}) => {
  await page.goto("/tasks/s1");
  await page.locator(".composer textarea").fill("长任务：生成 PPT");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "停止生成", exact: true }),
  ).toBeVisible();
  const input = page.locator(".composer textarea");
  await input.fill("橙蓝配色");
  await page.getByRole("button", { name: "加入引导队列" }).click();
  const bubble = page.locator(".user-message").filter({ hasText: "橙蓝配色" });
  await expect(bubble).toHaveCount(0);
  await expect(page.locator(".steering-queue-row")).toHaveCount(1);
  const snapshot = await request.get(api + "/chat/queue?session_id=s1&agent_id=a1", {
    headers: { Authorization: "Bearer test-only" },
  });
  expect(snapshot.ok()).toBe(true);
  const stableId = (await snapshot.json()).items[0].input.id;
  await page.reload();
  await expect(bubble).toHaveCount(0);
  await expect(page.locator(".steering-queue-row")).toHaveCount(1);
  await page.getByRole("button", { name: "编辑第 1 条引导" }).click();
  await page.getByLabel("第 1 条引导内容").fill("橙蓝配色，保留目录");
  await page.getByLabel("第 1 条引导内容").press("Enter");
  await expect(page.locator(".steering-queue-row")).toContainText("保留目录");
  await expect(bubble).toHaveCount(0);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/chat/queue/*/steer", async (route) => {
    const response = await route.fetch();
    await held;
    await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "发送第 1 条引导" }).click();
  try {
    await expect(bubble).toContainText("已接收");
    await expect(bubble).toHaveCount(1);
    expect(await bubble.locator("..").getAttribute("data-message-id")).toBe(
      stableId,
    );
  } finally {
    release();
  }
  await expect(page.locator(".steering-queue-row")).toHaveCount(0);
});

test("parent completion keeps the outstanding expert visible until its real terminal event", async ({
  page,
  request,
}) => {
  await page.goto("/tasks/s1");
  await page.locator(".composer textarea").fill("长任务：制作 PPT");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "停止生成", exact: true }),
  ).toBeVisible();
  const progress = {
    worker_session_id: "worker",
    worker_agent_id: "expert",
    display_name: "PPT 专家",
    reply_id: "worker-reply",
    status: "running",
    revision: 1,
    activities: [],
    started_at: new Date().toISOString(),
  };
  await request.post(api + "/__test/events", {
    data: {
      session_id: "s1",
      events: [
        { type: "CUSTOM", name: "collaborator_progress", value: progress },
        { type: "REPLY_END", finished_reason: "completed" },
      ],
    },
  });
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "主助理已结束，1 位专家仍在处理" }),
  ).toBeVisible();
  await request.post(api + "/__test/events", {
    data: {
      session_id: "s1",
      events: [
        {
          type: "CUSTOM",
          name: "collaborator_progress",
          value: {
            ...progress,
            status: "completed",
            revision: 2,
            finished_at: new Date().toISOString(),
          },
        },
      ],
    },
  });
  await expect(
    page.getByRole("status").filter({ hasText: "专家仍在处理" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /PPT 专家已完成/ }),
  ).toBeVisible();
});

test("file and folder icons and padded row areas open, while delete never opens a preview", async ({
  page,
}) => {
  await page.route("**/api/manager/projects/project-1/files?**", (route) => {
    const query = new URL(route.request().url()).searchParams;
    return route.fulfill({
      json: {
        items:
          query.get("area") === "uploads" && !query.get("path")
            ? [
                {
                  name: "验收.md",
                  path: "验收.md",
                  is_directory: false,
                  size: 100,
                  modified_at: "",
                },
                {
                  name: "资料夹",
                  path: "资料夹",
                  is_directory: true,
                  size: 0,
                  modified_at: "",
                },
              ]
            : [],
      },
    });
  });
  let fileReads = 0;
  await page.route("**/api/manager/projects/project-1/file?**", (route) => {
    fileReads++;
    return route.fulfill({ contentType: "text/plain", body: "预览验收" });
  });
  await page.goto("/tasks/s1");
  const panel = page.locator(".workspace-panel");
  const file = panel.locator(".file-row").filter({ hasText: "验收.md" });
  const folder = panel.locator(".file-row").filter({ hasText: "资料夹" });
  await file.locator(".file-type-icon").click();
  await expect(panel.locator(".file-preview:visible")).toContainText(
    "预览验收",
  );
  await panel.getByRole("tab", { name: "工作空间", exact: true }).click();
  await folder.locator(".file-open svg").first().click();
  await expect(panel.locator(".breadcrumb")).toContainText("资料夹");
  await panel
    .locator(".breadcrumb")
    .getByRole("button", { name: "工作空间", exact: true })
    .click();
  await folder.click({ position: { x: 2, y: 2 } });
  await expect(panel.locator(".breadcrumb")).toContainText("资料夹");
  await panel
    .locator(".breadcrumb")
    .getByRole("button", { name: "工作空间", exact: true })
    .click();
  await file.click({ position: { x: 2, y: 2 } });
  await expect(panel.locator(".file-preview:visible")).toContainText(
    "预览验收",
  );
  await panel.getByRole("tab", { name: "工作空间", exact: true }).click();
  await panel.getByRole("button", { name: "关闭标签 验收.md" }).click();
  const beforeDelete = fileReads;
  await file.hover();
  await file.getByRole("button", { name: "删除验收.md" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(fileReads).toBe(beforeDelete);
  await expect(panel.locator(".file-preview:visible")).toHaveCount(0);
});

test("a failed supplement can retry and is received only after its native HintBlock", async ({
  page,
  request,
}) => {
  await page.goto("/tasks/s1");
  await page.locator(".composer textarea").fill("长任务：生成 PPT");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "停止生成", exact: true }),
  ).toBeVisible();
  await page.locator(".composer textarea").fill("蓝色为主，橙色强调");
  await page.getByRole("button", { name: "加入引导队列" }).click();
  const bubble = page
    .locator(".user-message")
    .filter({ hasText: "蓝色为主，橙色强调" });
  await expect(bubble).toHaveCount(0);
  await expect(page.locator(".steering-queue-row")).toContainText("蓝色为主，橙色强调");
  const snapshot = await request.get(
    api + "/chat/queue?session_id=s1&agent_id=a1",
    { headers: { Authorization: "Bearer test-only" } },
  );
  const { items } = await snapshot.json();
  let attempts = 0;
  await page.route("**/api/chat/queue/*/steer", (route) => {
    if (++attempts === 1)
      return route.fulfill({ status: 503, json: { detail: "稍后重试" } });
    items[0].state = "steering";
    return route.fulfill({ json: { items } });
  });
  await page.route(/\/api\/chat\/queue\?/, (route) =>
    route.fulfill({ json: { items } }),
  );
  await page.getByRole("button", { name: "发送第 1 条引导" }).click();
  await expect(bubble).toHaveCount(0);
  await expect(page.locator(".steering-queue-row")).toContainText("稍后重试");
  await page.getByRole("button", { name: "发送第 1 条引导" }).click();
  await expect(bubble).toContainText("引导中");
  await expect(page.locator(".steering-queue-row")).toHaveCount(0);
  const queueItem = items[0];
  await request.post(api + "/__test/events", {
    data: {
      session_id: "s1",
      events: [
        {
          type: "CUSTOM",
          name: "chat_input_injected",
          value: {
            queue_item_id: queueItem.id,
            message_ids: [queueItem.input.id],
          },
        },
      ],
    },
  });
  await expect(bubble).toContainText("引导中");
  await request.post(api + "/__test/events", {
    data: {
      session_id: "s1",
      events: [
        {
          type: "HINT_BLOCK",
          block_id: `${queueItem.id}:0`,
          source: "chat_input_steering",
          hint: queueItem.input.content,
          user_message: {
            ...queueItem.input,
            metadata: {
              ...queueItem.input.metadata,
              agentkit_delivery: {
                kind: "steer",
                state: "received",
                hint_id: `${queueItem.id}:0`,
              },
            },
          },
        },
      ],
    },
  });
  await expect(bubble).toContainText("已接收");
  await expect(bubble).toHaveCount(1);
  await expect(page.locator(".steering-queue-row")).toHaveCount(0);
});
