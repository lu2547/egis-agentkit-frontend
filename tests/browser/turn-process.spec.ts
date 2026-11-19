import { test, expect, type APIRequestContext } from "@playwright/test";
const base = "http://127.0.0.1:38194";
const emit = async (
  request: APIRequestContext,
  events: Record<string, unknown>[],
) => {
  const response = await request.post(base + "/__test/events", {
    data: { session_id: "s1", events },
  });
  expect(response.ok()).toBe(true);
};
const text = (id: string, value: string) => [
  { type: "TEXT_BLOCK_START", block_id: id },
  { type: "TEXT_BLOCK_DELTA", block_id: id, delta: value },
  { type: "TEXT_BLOCK_END", block_id: id },
];
const call = (id: string, name: string, input: unknown) => [
  { type: "TOOL_CALL_START", tool_call_id: id, tool_call_name: name },
  { type: "TOOL_CALL_DELTA", tool_call_id: id, delta: JSON.stringify(input) },
  { type: "TOOL_CALL_END", tool_call_id: id },
];
const done = (
  id: string,
  name: string,
  state = "success",
  output = "读取完成",
) => [
  { type: "TOOL_RESULT_START", tool_call_id: id, tool_call_name: name },
  { type: "TOOL_RESULT_TEXT_DELTA", tool_call_id: id, delta: output },
  { type: "TOOL_RESULT_END", tool_call_id: id, state },
];
test.beforeEach(async ({ page, request }) => {
  await request.post(base + "/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
});

test("expert progress stacks at the top right after the assistant finishes", async ({
  page,
  request,
}) => {
  const worker = {
    worker_session_id: "skills-worker",
    worker_agent_id: "skills-agent",
    display_name: "Skills 助手",
    status: "running",
    reply_id: "skills-reply",
    revision: 1,
    activities: [{ id: "create", name: "CreateSkill", state: "running" }],
  };
  const other = {
    ...worker,
    worker_session_id: "document-worker",
    display_name: "文档专家",
    activities: [{ id: "read", name: "Read", state: "running" }],
  };
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/tasks/s1");
  await page.locator(".composer textarea").fill("长任务：专家协作");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.locator(".process-heading")).toBeVisible();
  await emit(request, [
    { type: "REPLY_END", finished_reason: "completed" },
    { type: "CUSTOM", name: "collaborator_progress", value: worker },
    { type: "CUSTOM", name: "collaborator_progress", value: other },
  ]);
  const first = page.getByRole("region", { name: "Skills 助手", exact: true });
  const second = page.getByRole("region", { name: "文档专家", exact: true });
  const running = first.getByRole("status");
  const spinner = running.locator("svg");
  const activeTool = first.getByText("创建技能");
  await expect(activeTool).toBeVisible();
  await expect(activeTool).toHaveCSS("animation-name", "activity-shimmer");
  await expect(spinner).toHaveCSS("animation-name", /^collaborator-spin/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(spinner).toHaveCSS("animation-name", "none");
  await expect(activeTool).toHaveCSS("animation-name", "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(second.getByText("读取文件")).toBeVisible();
  const top = (await first.boundingBox())!;
  const bottom = (await second.boundingBox())!;
  const chat = (await page.locator(".chat-column").boundingBox())!;
  expect(top.y - chat.y).toBeLessThan(85);
  expect(chat.x + chat.width - top.x - top.width).toBeLessThan(25);
  expect(top.width).toBeLessThanOrEqual(260);
  expect(bottom.y).toBeGreaterThanOrEqual(top.y + top.height);
  await first.getByRole("button", { name: "缩小专家窗口" }).click();
  await expect(spinner).toBeVisible();
  await expect(first.getByText("创建技能")).toBeHidden();
  await expect(second.getByText("读取文件")).toBeVisible();
  await page.route("**/api/sessions/skills-worker/messages?**", (route) => {
    expect(new URL(route.request().url()).searchParams.get("agent_id")).toBe("skills-agent");
    const timestamp = new Date().toISOString();
    return route.fulfill({ json: {
      event_cursor: null,
      is_running: false,
      has_more: false,
      messages: [{
        id: "skills-reply", role: "assistant", name: "skills-assistant",
        created_at: timestamp, finished_at: timestamp,
        content: [
          {
            id: "answer",
            type: "text",
            created_at: timestamp,
            text: "## 登记结果\n\n周报技能已登记。\n\n- **交付物** `artifacts/weekly-report/SKILL.md`",
          },
        ],
      }],
    } });
  });
  await emit(request, [{
    type: "CUSTOM", name: "collaborator_progress",
    value: { ...worker, revision: 2, status: "completed" },
  }]);
  await expect(first.getByText("已完成")).toBeVisible();
  await expect(spinner).toHaveCount(0);
  await first.getByRole("button", { name: "展开专家窗口" }).click();
  await expect(first.getByText("周报技能已登记。")).toBeVisible();
  const titleSize = await first
    .locator(".worker-name")
    .evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  for (const text of [
    "登记结果",
    "周报技能已登记。",
    "交付物",
    "artifacts/weekly-report/SKILL.md",
  ]) {
    const size = await first
      .getByText(text, { exact: true })
      .evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    expect(size, text).toBeLessThan(titleSize);
  }
  await page.route("**/api/manager/tasks/s1", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ json: {
      ...(await response.json()),
      collaborator_progress: [{ ...worker, revision: 2, status: "completed" }, other],
    } });
  });
  await page.reload();
  await expect(first.getByRole("button", { name: "展开专家窗口" })).toBeVisible();
  await expect(second.getByText("读取文件")).toBeVisible();
  await emit(request, [{
    type: "CUSTOM", name: "collaborator_progress_removed",
    value: { worker_session_id: other.worker_session_id },
  }]);
  await expect(second).toHaveCount(0);
});

test("the active Skill activity shows the catalog display name", async ({
  page,
  request,
}) => {
  const alias = "skill-0123456789abcdef0123456789abcdef_0123456789ab";
  await page.route("**/manager/skills", (route) =>
    route.fulfill({
      json: { items: [{ runtime_name: alias, display_name: "ppt-master" }] },
    }),
  );
  await page.goto("/tasks/s1");
  await page.locator(".composer textarea").fill("长任务：用技能制作演示文稿");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.locator(".process-heading")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await emit(request, call("skill", "Skill", { skill: alias }));
  const activity = page.locator(".latest-activity");
  await expect(activity).toHaveText("正在使用技能 · ppt-master");
  await expect(activity).not.toContainText(alias);
});

test("process and activity groups start folded, stream status updates correctly and preserve reading order", async ({
  page,
  request,
}) => {
  await page.goto("/tasks/s1");
  await page.locator(".composer textarea").fill("长任务：分组过程验证");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  const process = page.locator(".process-heading");
  await expect(process).toHaveAttribute("aria-expanded", "false");
  await emit(request, [
    ...text("intro", "先核对上传资料。"),
    { type: "THINKING_BLOCK_START", block_id: "think" },
    {
      type: "THINKING_BLOCK_DELTA",
      block_id: "think",
      delta: "根据文件结构选择读取范围。",
    },
    { type: "THINKING_BLOCK_END", block_id: "think" },
    ...call("read", "Read", {
      file_path: "/workspace/业务 说明.pdf",
      pages: "1-3",
    }),
    ...call("glob", "Glob", { pattern: "*.pdf" }),
    { type: "TOOL_RESULT_START", tool_call_id: "read", tool_call_name: "Read" },
  ]);
  await expect(process).toContainText("2 项工具活动");
  await expect(page.locator(".activity-group")).toHaveCount(0);
  await process.click();
  const group = page.getByRole("button", {
    name: "执行工具 2 次",
    exact: true,
  });
  await expect(group).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".process-commentary")).toContainText(
    "先核对上传资料。",
  );
  await group.click();
  const read = page.locator('[data-activity-id="tool:read"]');
  await expect(read).toHaveAttribute("data-status", "running");
  await expect(read.locator(".activity-state")).toHaveText("执行中");
  await expect(read.locator(".activity-summary")).toContainText(
    "业务 说明.pdf · 第 1-3 页",
  );
  await emit(request, [
    {
      type: "TOOL_RESULT_TEXT_DELTA",
      tool_call_id: "read",
      delta: "PDF 中的业务段落。",
    },
    { type: "TOOL_RESULT_END", tool_call_id: "read", state: "success" },
    ...done("glob", "Glob"),
  ]);
  await expect(read).toHaveAttribute("data-status", "success");
  await expect(read.locator(".activity-state")).toHaveCount(0);
  await expect(read.locator(".activity-icon")).toHaveAttribute(
    "aria-label",
    "已完成",
  );
  await read.locator("summary").click();
  await expect(read.locator(".activity-detail")).toContainText(
    "PDF 中的业务段落。",
  );
  await emit(request, [
    ...text("comment", "资料已核对，再校验交付。"),
    ...call("bash", "Bash", { command: "python validate.py" }),
    ...done("bash", "Bash"),
    ...text("answer", "## 已完成交付\n\n这是最终回答。"),
    { type: "REPLY_END", finished_reason: "completed" },
  ]);
  await expect(process).toHaveAttribute("aria-expanded", "true");
  await expect(process).toContainText("3 项工具活动");
  await expect(page.getByRole("heading", { name: "已完成交付" })).toBeVisible();
  await expect(
    page.locator(".process-body").first().locator(":scope > *"),
  ).toHaveClass([
    "process-commentary",
    "activity-group",
    "process-commentary",
    "activity-group",
  ]);
  await expect(
    page.getByRole("button", { name: "执行工具 1 次", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(group).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".thinking")).toHaveCount(0);
  await read.locator("summary").click();
  await page
    .getByRole("button", { name: "执行工具 1 次", exact: true })
    .click();
  await page.screenshot({
    path: "docs/screenshots/workbuddy/process-grouped.png",
    animations: "disabled",
  });
  await process.click();
  await expect(process).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("heading", { name: "已完成交付" })).toBeVisible();
  // MotionCollapse keeps mounted descendants to preserve the user's detail state.
  // Assert the clipping container, rather than descendants whose boxes remain laid out.
  const folded = page.locator(".turn-process > .motion-collapse");
  await expect(folded).toHaveAttribute("aria-hidden", "true");
  await expect(folded).toHaveCSS("grid-template-rows", "0px");
});

test("confirmation is actionable outside the folded process and clears when stopped", async ({
  page,
  request,
}) => {
  await page.goto("/tasks/s1");
  await page.locator(".composer textarea").fill("长任务：确认测试");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await emit(request, [
    ...call("approval", "Bash", { command: "touch report.txt" }),
    {
      type: "REQUIRE_USER_CONFIRM",
      tool_calls: [
        {
          type: "tool_call",
          id: "approval",
          name: "Bash",
          input: '{"command":"touch report.txt"}',
          state: "asking",
          created_at: new Date().toISOString(),
        },
      ],
    },
  ]);
  await expect(page.locator(".process-heading")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(
    page.getByRole("button", { name: "允许此次操作", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".turn-process .permission-card")).toHaveCount(0);
  await page.getByRole("button", { name: "停止生成", exact: true }).click();
  await expect(page.getByText("已停止生成", { exact: true })).toBeVisible();
  await expect(page.locator(".permission-card")).toHaveCount(0);
  await page.locator(".process-heading").click();
  await page
    .getByRole("button", { name: "执行工具 1 次", exact: true })
    .click();
  await expect(
    page.locator('[data-activity-id="tool:approval"]'),
  ).toHaveAttribute("data-status", "interrupted");
});

test("text-only replies retain the duration summary when completed and reopened from history", async ({
  page,
  request,
}) => {
  await page.goto("/tasks/s1");
  await page.locator(".composer textarea").fill("长任务：纯正文回复");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  const process = page.locator(".process-heading");
  await expect(process).toContainText("正在处理");
  await emit(request, [
    ...text("answer", "这是没有工具调用的回答。"),
    { type: "REPLY_END", finished_reason: "completed" },
  ]);
  await expect(process).toContainText("处理时长");
  await expect(process).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByText("这是没有工具调用的回答。", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".tool-count")).toHaveCount(0);
  await page.route("**/api/sessions/s1/messages?**", (route) =>
    route.fulfill({
      json: {
        messages: [
          {
            id: "plain-history",
            name: "expert",
            role: "assistant",
            metadata: {},
            created_at: "2026-11-05T00:00:00Z",
            finished_at: "2026-11-05T00:00:12Z",
            finished_reason: "completed",
            content: [
              {
                type: "text",
                id: "answer",
                text: "这是没有工具调用的回答。",
                created_at: "2026-11-05T00:00:00Z",
              },
            ],
          },
        ],
        is_running: false,
        has_more: false,
        event_cursor: null,
      },
    }),
  );
  await page.reload();
  await expect(process).toContainText("处理时长 12 秒");
  await expect(process).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByText("这是没有工具调用的回答。", { exact: true }),
  ).toBeVisible();
});

for (const theme of ["light", "dark"] as const) {
  test(`completed history is folded by default in ${theme} and tool details stay readable`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    const stamp = "2026-11-05T00:00:00Z";
    const call = {
      type: "tool_call",
      id: "t",
      name: "Read",
      input: '{"file_path":"/work/规则.md"}',
      state: "finished",
      created_at: stamp,
      finished_at: stamp,
    };
    await page.route("**/api/sessions/s1/messages?**", (route) =>
      route.fulfill({
        json: {
          messages: [
            {
              id: "history",
              name: "expert",
              role: "assistant",
              metadata: {},
              created_at: stamp,
              finished_at: "2026-11-05T00:01:45Z",
              finished_reason: "completed",
              content: [
                {
                  type: "text",
                  id: "n",
                  text: "先检查历史资料。",
                  created_at: stamp,
                },
                call,
                {
                  type: "tool_result",
                  id: "t",
                  name: "Read",
                  state: "error",
                  output: "无法读取此文件",
                  created_at: stamp,
                  finished_at: stamp,
                },
                {
                  type: "text",
                  id: "final",
                  text: "请检查文件是否仍然存在。",
                  created_at: stamp,
                },
              ],
            },
          ],
          is_running: false,
          has_more: false,
          event_cursor: null,
        },
      }),
    );
    await page.goto("/tasks/s1");
    const process = page.locator(".process-heading");
    await expect(process).toHaveAttribute("aria-expanded", "false");
    await expect(process).toContainText("处理时长 1 分 45 秒");
    await expect(
      page.getByText("请检查文件是否仍然存在。", { exact: true }),
    ).toBeVisible();
    await process.click();
    const group = page.getByRole("button", {
      name: "执行工具 1 次",
      exact: true,
    });
    await expect(group).toHaveAttribute("aria-expanded", "false");
    await group.click();
    const row = page.locator('[data-activity-id="tool:t"]');
    await expect(row).toHaveAttribute("data-status", "error");
    await expect(row.locator(".activity-state")).toHaveText("执行失败");
    await row.locator("summary").click();
    await expect(row.locator(".activity-detail")).toContainText(
      "无法读取此文件",
    );
    expect(
      await row
        .locator("pre")
        .first()
        .evaluate((el) => getComputedStyle(el).color),
    ).toBe(theme === "dark" ? "rgb(237, 237, 237)" : "rgb(25, 25, 25)");
    await page.screenshot({
      path: `docs/screenshots/workbuddy/process-${theme}.png`,
      animations: "disabled",
    });
    await page.reload();
    await expect(process).toHaveAttribute("aria-expanded", "false");
  });
}
