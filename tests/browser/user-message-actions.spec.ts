import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { AssistantMsg, UserMsg } from "@agentscope-ai/agentscope/message";
import { createAnnotatedMessage } from "../../src/domain/textAnnotations";

const api = "http://127.0.0.1:38194";
const prefix = UserMsg({
  id: "earlier-user",
  name: "user",
  content: "保留前文",
});
const original = UserMsg({
  id: "edit-user",
  name: "user",
  content: "原始问题",
});
const later = AssistantMsg({
  id: "discarded-reply",
  name: "analyst",
  content: "应丢弃的旧回答",
});
later.finished_at = new Date().toISOString();

async function open(
  page: Page,
  request: APIRequestContext,
  message = original,
) {
  await request.post(`${api}/__test/reset`);
  await request.post(`${api}/__test/messages`, {
    data: { session_id: "s1", messages: [prefix, message, later] },
  });
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
  await page.goto("/tasks/s1");
  await expect(page.getByText("应丢弃的旧回答", { exact: true })).toBeVisible();
  const entry = page.locator('[data-message-id="edit-user"]');
  await entry.hover();
  await expect(
    entry.getByRole("button", { name: "编辑消息", exact: true }),
  ).toBeEnabled();
  return entry;
}

test("user actions reveal on hover and focus, copy visible text, and cancel an inline edit", async ({
  page,
  request,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const entry = await open(page, request);
  const actions = entry.locator(".user-message-actions");
  await expect(actions).toHaveCSS("opacity", "1");
  await page.mouse.move(0, 0);
  await expect(actions).toHaveCSS("opacity", "0");
  await entry.getByRole("button", { name: "复制消息", exact: true }).focus();
  await expect(actions).toHaveCSS("opacity", "1");
  await entry.getByRole("button", { name: "复制消息", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "原始问题",
  );
  await entry.getByRole("button", { name: "编辑消息", exact: true }).click();
  await expect(
    entry.getByRole("textbox", { name: "编辑消息内容" }),
  ).toHaveValue("原始问题");
  await expect(entry).toContainText(
    "编辑后将从此处重新开始对话，已生成的产物会保留。",
  );
  await page.screenshot({ path: "/tmp/agentkit-user-message-editor.png" });
  await entry.getByRole("textbox").fill("不会发送的草稿");
  await entry.getByRole("button", { name: "取消", exact: true }).click();
  await expect(entry.getByRole("textbox")).toHaveCount(0);
  await expect(entry).toContainText("原始问题");
  await expect(page.locator(".message-list")).toContainText("应丢弃的旧回答");
});

test("resending replaces the selected turn, drops later dialog, and persists after reload", async ({
  page,
  request,
}) => {
  const entry = await open(page, request);
  const artifactUrl = `${api}/manager/projects/project-1/file?area=artifacts&path=${encodeURIComponent("行动计划.md")}`;
  const artifactBefore = await (
    await request.get(artifactUrl, {
      headers: { Authorization: "Bearer test-only" },
    })
  ).body();
  await entry.getByRole("button", { name: "编辑消息", exact: true }).click();
  await entry.getByRole("textbox").fill("新的问题");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/chat/", async (route) => {
    await gate;
    await route.continue();
  });
  const sent = page.waitForRequest(
    (r) => r.url().endsWith("/api/chat/") && r.method() === "POST",
  );
  await entry.getByRole("button", { name: "发送", exact: true }).click();
  const payload = (await sent).postDataJSON();
  expect(payload.replace_message_id).toBe("edit-user");
  expect(payload.input.id).toBe("edit-user");
  await expect(page.locator(".message-list")).not.toContainText(
    "应丢弃的旧回答",
  );
  await expect(page.locator(".assistant-preparing")).toBeVisible();
  await expect(
    page
      .locator('[data-message-id="earlier-user"]')
      .getByRole("button", { name: "编辑消息", exact: true }),
  ).toBeDisabled();
  release();
  await expect(entry.getByRole("textbox")).toHaveCount(0);
  await expect(page.locator(".message-list")).toContainText("已完成研究简报");
  await page.reload();
  await expect(page.locator(".message-list")).toContainText("保留前文");
  await expect(entry).toContainText("新的问题");
  await expect(page.locator(".message-list")).not.toContainText(
    "应丢弃的旧回答",
  );
  expect(
    await (
      await request.get(artifactUrl, {
        headers: { Authorization: "Bearer test-only" },
      })
    ).body(),
  ).toEqual(artifactBefore);
});

test("rejected resend restores history and retains the edited draft and error", async ({
  page,
  request,
}) => {
  const entry = await open(page, request);
  await page.route("**/api/chat/", (route) =>
    route.fulfill({
      status: 409,
      json: { detail: "对话正在运行，请稍后重试" },
    }),
  );
  await entry.getByRole("button", { name: "编辑消息", exact: true }).click();
  await entry.getByRole("textbox").fill("失败时保留草稿");
  await entry.getByRole("button", { name: "发送", exact: true }).click();
  await expect(entry.getByRole("textbox")).toHaveValue("失败时保留草稿");
  await expect(entry.getByRole("alert")).toContainText(
    "对话正在运行，请稍后重试",
  );
  await expect(page.locator(".message-list")).toContainText("应丢弃的旧回答");
  await expect(
    entry.getByRole("button", { name: "发送", exact: true }),
  ).toBeEnabled();
});

test("resend keeps reference excerpts, annotations, attachments and metadata while copying only the prompt", async ({
  page,
  request,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const message = createAnnotatedMessage(
    "查看这份文件",
    [
      {
        kind: "file",
        id: "ref-file",
        projectId: "project-1",
        path: "行动计划.md",
        name: "行动计划.md",
      },
      {
        id: "preview",
        projectId: "project-1",
        area: "artifacts",
        path: "预览.pdf",
        checksum: "checksum",
        page: 1,
        pageCount: 1,
        width: 800,
        height: 600,
        regions: [],
        image: "data:image/png;base64,YWJj",
        excerpt: "必须保留的页面摘录",
      },
    ],
    [
      {
        id: "note-1",
        messageId: "earlier-user",
        start: 0,
        end: 4,
        text: "保留前文",
        comment: "补充说明",
      },
    ],
  );
  message.id = "edit-user";
  message.metadata.agentkit_delivery = { kind: "steer", state: "received" };
  message.content.push({
    id: "attachment",
    type: "data",
    name: "原附件.txt",
    source: { type: "url", url: "https://example.test/attachment.txt" },
    created_at: message.created_at,
  });
  const entry = await open(page, request, message);
  await entry.getByRole("button", { name: "复制消息", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "查看这份文件",
  );
  await entry.getByRole("button", { name: "编辑消息", exact: true }).click();
  await entry.getByRole("textbox").fill("");
  await expect(
    entry.getByRole("button", { name: "发送", exact: true }),
  ).toBeEnabled();
  await entry.getByRole("textbox").fill("修改后的要求");
  const sent = page.waitForRequest(
    (r) => r.url().endsWith("/api/chat/") && r.method() === "POST",
  );
  await entry.getByRole("button", { name: "发送", exact: true }).click();
  const input = (await sent).postDataJSON().input;
  expect(input.id).toBe("edit-user");
  expect(input.metadata.preview_prompt).toBe("修改后的要求");
  expect(input.metadata.annotation_prompt).toBe("修改后的要求");
  expect(input.metadata.project_file_references).toEqual(
    message.metadata.project_file_references,
  );
  expect(input.metadata.text_annotations).toEqual(
    message.metadata.text_annotations,
  );
  expect(input.metadata.preview_references).toEqual(
    message.metadata.preview_references,
  );
  expect(input.metadata.agentkit_delivery).toBeUndefined();
  expect(input.content[0].text).toContain("【项目文件：行动计划.md】");
  expect(input.content[0].text).toContain("用户评论：补充说明");
  expect(input.content[0].text).toContain("必须保留的页面摘录");
  expect(
    input.content.find((block: { id: string }) => block.id === "preview"),
  ).toEqual(message.content.find((block) => block.id === "preview"));
  expect(input.content.at(-1)).toEqual(message.content.at(-1));
  await expect(entry).toContainText("原附件.txt");
});

test("editing is disabled while waiting for approval or saving session settings", async ({
  page,
  request,
}) => {
  const entry = await open(page, request);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/manager/tasks/s1/settings", async (route) => {
    await gate;
    await route.continue();
  });
  await page.getByTestId("permission-mode-trigger").click();
  await page.locator('[role="menuitemradio"][data-mode="bypass"]').click();
  try {
    await expect(
      entry.getByRole("button", { name: "编辑消息", exact: true }),
    ).toBeDisabled();
    await expect(
      entry.getByRole("button", { name: "复制消息", exact: true }),
    ).toBeEnabled();
  } finally {
    release();
  }
  await expect(
    entry.getByRole("button", { name: "编辑消息", exact: true }),
  ).toBeEnabled();
  await page.locator(".composer textarea").fill("测试确认");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.getByText("需要你的确认")).toBeVisible();
  await expect(
    entry.getByRole("button", { name: "编辑消息", exact: true }),
  ).toBeDisabled();
  await expect(
    entry.getByRole("button", { name: "复制消息", exact: true }),
  ).toBeEnabled();
});

test("unconnected history keeps copy available and disables editing", async ({
  page,
  request,
}) => {
  await request.post(`${api}/__test/reset`);
  await request.post(`${api}/__test/messages`, {
    data: { session_id: "s1", messages: [original, later] },
  });
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
  await page.route("**/api/sessions/s1/stream?**", (route) =>
    route.fulfill({ status: 503, json: { detail: "事件连接暂时不可用" } }),
  );
  await page.goto("/tasks/s1");
  const entry = page.locator('[data-message-id="edit-user"]');
  await entry.hover();
  await expect(
    entry.getByRole("button", { name: "编辑消息", exact: true }),
  ).toBeDisabled();
  await expect(
    entry.getByRole("button", { name: "复制消息", exact: true }),
  ).toBeEnabled();
});

test.describe("touch actions", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  test("user actions stay visible without hover on a touch device", async ({
    page,
    request,
  }) => {
    const entry = await open(page, request);
    await page.mouse.move(0, 0);
    await expect(entry.locator(".user-message-actions")).toHaveCSS(
      "opacity",
      "1",
    );
  });
});

test("empty ordinary edits cannot send, and running turns disable editing while copy stays usable", async ({
  page,
  request,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const entry = await open(page, request);
  await entry.getByRole("button", { name: "编辑消息", exact: true }).click();
  await entry.getByRole("textbox").fill("   ");
  await expect(
    entry.getByRole("button", { name: "发送", exact: true }),
  ).toBeDisabled();
  await entry.getByRole("button", { name: "取消", exact: true }).click();
  await page.locator(".composer textarea").fill("长任务");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(
    entry.getByRole("button", { name: "编辑消息", exact: true }),
  ).toBeDisabled();
  await entry.hover();
  await entry.getByRole("button", { name: "复制消息", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "原始问题",
  );
});

test("editing a live steering message drops the containing reply before POST accepts", async ({
  page,
  request,
}) => {
  await request.post(`${api}/__test/reset`);
  await request.post(`${api}/__test/messages`, {
    data: { session_id: "s1", messages: [prefix] },
  });
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
  await page.goto("/tasks/s1");
  await page.locator(".composer textarea").fill("长任务：初始请求");
  const submitted = page.waitForRequest(
    (r) => r.url().endsWith("/api/chat/") && r.method() === "POST",
  );
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  const initial = (await submitted).postDataJSON().input;
  const steering = UserMsg({
    id: "live-steered",
    name: "user",
    content: "旧的引导文本",
    metadata: {
      agentkit_delivery: {
        kind: "steer",
        state: "received",
        hint_id: "live-hint",
      },
    },
  });
  await expect(
    page.locator(".assistant-message:not(.assistant-preparing)"),
  ).toHaveCount(1);
  const assistantId = await page
    .locator(".message-entry:has(.assistant-message)")
    .last()
    .getAttribute("data-message-id");
  await request.post(`${api}/__test/events`, {
    data: {
      session_id: "s1",
      events: [
        {
          type: "HINT_BLOCK",
          block_id: "live-hint",
          source: "chat_input_steering",
          hint: "旧的引导文本",
          user_message: steering,
        },
        { type: "TEXT_BLOCK_START", block_id: "old-answer" },
        {
          type: "TEXT_BLOCK_DELTA",
          block_id: "old-answer",
          delta: "包含引导的旧回答",
        },
        { type: "TEXT_BLOCK_END", block_id: "old-answer" },
        { type: "REPLY_END", finished_reason: "completed" },
      ],
    },
  });
  const containing = AssistantMsg({
    id: assistantId!,
    name: "analyst",
    content: "包含引导的旧回答",
  });
  containing.finished_at = new Date().toISOString();
  // Native persistence orders injected users before the completed containing reply.
  await request.post(`${api}/__test/messages`, {
    data: {
      session_id: "s1",
      messages: [prefix, initial, steering, containing],
    },
  });
  const entry = page.locator('[data-message-id="live-steered"]');
  await entry.hover();
  await expect(
    entry.getByRole("button", { name: "编辑消息", exact: true }),
  ).toBeEnabled();
  await entry.getByRole("button", { name: "编辑消息", exact: true }).click();
  await entry.getByRole("textbox").fill("修改后的引导");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/chat/", async (route) => {
    await gate;
    await route.continue();
  });
  await entry.getByRole("button", { name: "发送", exact: true }).click();
  try {
    await expect(
      page.locator(`[data-message-id="${assistantId}"]`),
    ).toHaveCount(0);
    await expect(page.locator(".message-list")).not.toContainText(
      "旧的引导文本",
    );
    await expect(entry.getByRole("textbox")).toHaveValue("修改后的引导");
    await expect(page.locator(".assistant-preparing")).toBeVisible();
  } finally {
    release();
  }
  await expect(entry.getByRole("textbox")).toHaveCount(0);
  await page.reload();
  await expect(entry).toContainText("修改后的引导");
  await expect(page.locator(".message-list")).not.toContainText(
    "包含引导的旧回答",
  );
  await expect(page.locator(".message-list")).toContainText("保留前文");
});

test("a rewrite marker synchronizes another open tab before the regenerated reply", async ({
  page,
  request,
  context,
}) => {
  const entry = await open(page, request);
  const second = await context.newPage();
  await second.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
  await second.goto("/tasks/s1");
  await expect(
    second.getByText("应丢弃的旧回答", { exact: true }),
  ).toBeVisible();
  await expect(
    second
      .locator('[data-message-id="edit-user"]')
      .getByRole("button", { name: "编辑消息", exact: true }),
  ).toBeEnabled();
  await entry.getByRole("button", { name: "编辑消息", exact: true }).click();
  await entry.getByRole("textbox").fill("跨标签页的新问题");
  await entry.getByRole("button", { name: "发送", exact: true }).click();
  for (const tab of [page, second]) {
    await expect(tab.locator(".message-list")).not.toContainText(
      "应丢弃的旧回答",
    );
    await expect(tab.locator('[data-message-id="edit-user"]')).toContainText(
      "跨标签页的新问题",
    );
    await expect(tab.locator(".message-list")).toContainText("保留前文");
    await expect(tab.locator(".message-list")).toContainText("已完成研究简报");
    await expect(tab.locator(".assistant-message")).toHaveCount(1);
  }
  await second.close();
});
