import { expect, test, type APIRequestContext } from "@playwright/test";

const base = "http://127.0.0.1:38194";
const stamp = "2026-11-23T00:00:00Z";
const reference = (
  title: string,
  snippet: string,
  id: string,
  source = "doc",
  index = 1,
) => ({
  index,
  source,
  title,
  snippet,
  kb: "年金业务演示库",
  kb_id: "kb-1",
  doc_id: id,
  node_id: id + "-node",
  chunk: id + "-chunk",
  ver: "v1",
});
const firstSources = [
  reference(
    "企业年金缴费说明",
    "提交缴费前，逐项核对当期缴费清单、缴费基数及生效日期。",
    "doc-1",
  ),
  reference(
    "缴费核对操作指引",
    "先比对参保人员名单与本期变更记录，再核对缴费清单。",
    "wiki-1",
    "wiki",
    2,
  ),
];
function reply(
  id: string,
  references: ReturnType<typeof reference>[],
  answer = "已根据知识库资料完成整理" +
    references.map((item) => `[${item.index}]`).join("") +
    "。",
) {
  return {
    id,
    name: "assistant",
    role: "assistant",
    created_at: stamp,
    finished_at: stamp,
    content: [
      {
        type: "tool_call",
        id: id + "-search",
        name: "KnowledgeBaseSearch",
        input: '{"query":"年金规则"}',
        state: "finished",
        created_at: stamp,
        finished_at: stamp,
      },
      {
        type: "tool_result",
        id: id + "-search",
        name: "KnowledgeBaseSearch",
        output: "已找到相关文档。",
        state: "success",
        created_at: stamp,
        finished_at: stamp,
        metadata: { knowledge_search: { references } },
      },
      {
        type: "text",
        id: id + "-answer",
        text: answer,
        created_at: stamp,
        finished_at: stamp,
      },
    ],
  };
}
async function history(
  request: APIRequestContext,
  messages: ReturnType<typeof reply>[],
) {
  const response = await request.post(base + "/__test/messages", {
    data: { session_id: "s1", messages },
  });
  expect(response.ok()).toBe(true);
}
test.beforeEach(async ({ page, request }) => {
  await request.post(base + "/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
  await page.route("**/api/manager/tasks/s1/artifacts", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            reply_id: "reply-1",
            name: "缴费核对说明.md",
            path: "缴费核对说明.md",
            area: "artifacts",
            size: 1024,
            is_directory: false,
            modified_at: stamp,
          },
        ],
      },
    }),
  );
});

for (const theme of ["light", "dark"] as const) {
  test(`cited sources open normal workspace tabs below artifacts in ${theme}`, async ({
    page,
    request,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme });
    await history(request, [
      reply("reply-1", firstSources, "已根据缴费说明完成整理[1]。"),
      reply("reply-2", [
        reference(
          "账户转移说明",
          "核实转出与转入计划信息，登记转移申请。",
          "doc-2",
        ),
      ]),
    ]);
    const created = await request.post(base + "/manager/tasks", {
      headers: { Authorization: "Bearer test-only" },
      data: { definition_id: "personal" },
    });
    expect(created.ok()).toBe(true);
    await page.goto("/tasks/s1");
    const first = page.locator('[data-message-id="reply-1"]');
    const entry = first.getByRole("button", {
      name: "引用来源 (1)",
      exact: true,
    });
    await expect(entry).toBeVisible();
    const artifacts = await first
      .getByRole("button", { name: /查看项目产物/ })
      .boundingBox();
    const button = await entry.boundingBox();
    expect(button!.y).toBeGreaterThanOrEqual(artifacts!.y + artifacts!.height);
    await first.locator(".artifact-card").click();
    await expect(
      page.getByRole("tab", { name: "缴费核对说明.md", exact: true }),
    ).toBeVisible();
    await entry.click();
    const workspace = page.locator(".workspace-panel");
    let sources = workspace.getByRole("tabpanel", {
      name: "引用来源",
      exact: true,
    });
    await expect(sources).toBeVisible();
    await expect(
      sources.getByRole("heading", { name: "引用来源 (1)" }),
    ).toBeVisible();
    await expect(
      sources.getByRole("heading", { name: "企业年金缴费说明", exact: true }),
    ).toBeVisible();
    await expect(sources.getByText(firstSources[0]!.snippet)).toBeVisible();
    await expect(
      sources.getByText("缴费核对操作指引", { exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".knowledge-sources-panel")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "关闭引用来源", exact: true }),
    ).toHaveCount(0);
    expect(
      await entry.evaluate((el) => getComputedStyle(el).outlineStyle),
    ).toBe("none");
    const closeSource = () =>
      workspace
        .locator(".workspace-tab.active")
        .getByRole("button", { name: "关闭标签 引用来源" });
    await expect(closeSource()).not.toBeFocused();
    await expect(
      page.getByRole("tab", { name: "缴费核对说明.md", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("knowledge-source-tab.png"),
    });
    await workspace
      .getByRole("button", { name: "新标签页", exact: true })
      .click();
    await expect(
      workspace.getByRole("navigation", { name: "打开工作区页面" }),
    ).toBeVisible();
    await expect(
      workspace
        .locator(".workspace-start")
        .getByRole("button", { name: /引用来源/ }),
    ).toHaveCount(0);
    await entry.click();
    await expect(
      workspace.getByRole("tab", { name: "引用来源", exact: true }),
    ).toHaveCount(1);
    await page
      .locator('[data-message-id="reply-2"]')
      .getByRole("button", { name: "引用来源 (1)", exact: true })
      .click();
    await expect(
      workspace.getByRole("tab", { name: "引用来源", exact: true }),
    ).toHaveCount(2);
    sources = workspace.getByRole("tabpanel", {
      name: "引用来源",
      exact: true,
    });
    await expect(
      sources.getByRole("heading", { name: "账户转移说明" }),
    ).toBeVisible();
    await expect(
      sources.getByText("企业年金缴费说明", { exact: true }),
    ).toHaveCount(0);
    await page.reload();
    await expect(
      sources.getByRole("heading", { name: "账户转移说明" }),
    ).toBeVisible();
    await closeSource().click();
    await expect(
      sources.getByRole("heading", { name: "企业年金缴费说明" }),
    ).toBeVisible();
    await closeSource().click();
    await expect(
      page.getByRole("tab", { name: "缴费核对说明.md", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await entry.click();
    await page.locator('.sidebar a[href="/tasks/s2"]').click();
    await expect(page).toHaveURL("/tasks/s2");
    await expect(
      workspace.getByRole("tab", { name: "引用来源", exact: true }),
    ).toHaveCount(0);
  });
}

test("source tabs fit a narrow viewport and scroll independently", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const references = Array.from({ length: 20 }, (_, index) =>
    reference(
      `演示文档 ${index + 1}`,
      "这是一段文档命中的原文，用于验证引用列表的独立滚动。".repeat(4),
      `doc-${index}`,
      "doc",
      index + 1,
    ),
  );
  await history(request, [reply("reply-1", references)]);
  await page.goto("/tasks/s1");
  const entry = page.getByRole("button", {
    name: "引用来源 (20)",
    exact: true,
  });
  await entry.click();
  const workspace = page.locator(".workspace-panel");
  const sources = workspace.getByRole("tabpanel", {
    name: "引用来源",
    exact: true,
  });
  await expect(sources).toBeVisible();
  await expect
    .poll(async () => {
      const bounds = (await workspace.boundingBox())!;
      return Math.round(bounds.x + bounds.width);
    })
    .toBeLessThanOrEqual(390);
  const scroll = sources.getByLabel("引用来源列表");
  expect(await scroll.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );
  await scroll.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(
    sources.getByRole("heading", { name: "演示文档 20", exact: true }),
  ).toBeInViewport();
  await workspace
    .locator(".workspace-tab.active")
    .getByRole("button", { name: "关闭标签 引用来源" })
    .click();
  await expect(sources).not.toBeVisible();
  await workspace
    .getByRole("button", { name: "关闭工作空间", exact: true })
    .click();
  await entry.click();
  await expect(sources).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test("retrieval and streaming do not expose the entry; completion only exposes cited sources", async ({
  page,
  request,
}) => {
  await page.goto("/tasks/s1");
  await page.locator(".composer textarea").fill("长任务：查询知识库");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.locator(".latest-activity")).toBeVisible();
  const events = async (items: Record<string, unknown>[]) => {
    const response = await request.post(base + "/__test/events", {
      data: { session_id: "s1", events: items },
    });
    expect(response.ok()).toBe(true);
  };
  const emitSearch = async (
    id: string,
    references: ReturnType<typeof reference>[],
  ) =>
    events([
      {
        type: "TOOL_CALL_START",
        tool_call_id: id,
        tool_call_name: "KnowledgeBaseSearch",
      },
      {
        type: "TOOL_CALL_DELTA",
        tool_call_id: id,
        delta: '{"query":"缴费规则"}',
      },
      { type: "TOOL_CALL_END", tool_call_id: id },
      {
        type: "TOOL_RESULT_START",
        tool_call_id: id,
        tool_call_name: "KnowledgeBaseSearch",
      },
      {
        type: "TOOL_RESULT_END",
        tool_call_id: id,
        state: "success",
        metadata: { knowledge_search: { references } },
      },
    ]);
  await emitSearch("search-1", firstSources);
  await expect(page.locator(".reply-sources-entry")).toHaveCount(0);
  await emitSearch("search-2", [
    firstSources[0]!,
    reference("未引用文档", "未被回答引用。", "unused", "doc", 3),
  ]);
  await events([
    { type: "TEXT_BLOCK_START", block_id: "answer" },
    {
      type: "TEXT_BLOCK_DELTA",
      block_id: "answer",
      delta: "依据 Wiki 说明[2]整理。",
    },
    { type: "TEXT_BLOCK_END", block_id: "answer" },
  ]);
  await expect(
    page.getByText("依据 Wiki 说明[2]整理。", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".reply-sources-entry")).toHaveCount(0);
  await events([{ type: "REPLY_END", finished_reason: "completed" }]);
  await page.getByRole("button", { name: "引用来源 (1)", exact: true }).click();
  const sources = page.getByRole("tabpanel", { name: "引用来源", exact: true });
  await expect(
    sources.getByRole("heading", { name: "缴费核对操作指引" }),
  ).toBeVisible();
  await expect(sources.locator(".source-item")).toHaveCount(1);
  await expect(
    sources.getByText("企业年金缴费说明", { exact: true }),
  ).toHaveCount(0);
  await expect(sources.getByText("未引用文档", { exact: true })).toHaveCount(0);
});

test("a completed answer without explicit citations has no source entry", async ({
  page,
  request,
}) => {
  await history(request, [
    reply("reply-1", firstSources, "这条回答没有引用来源标记。"),
  ]);
  await page.goto("/tasks/s1");
  await expect(
    page.getByText("这条回答没有引用来源标记。", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".reply-sources-entry")).toHaveCount(0);
});
