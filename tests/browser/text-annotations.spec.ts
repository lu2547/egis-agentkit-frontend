import { test, expect } from "@playwright/test";
import { AssistantMsg } from "@agentscope-ai/agentscope/message";
const source = AssistantMsg({
  name: "personal",
  content: "这里是需要确认的专家协作说明。选择专家的两个入口，目前含义不同。",
});
source.id = "annotation-source";
source.finished_at = new Date().toISOString();
test("selected text has editable draft comments, immutable answered references and source navigation after reload", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
  let sent: any;
  const answer = AssistantMsg({
    name: "personal",
    content: "已确认：两个入口不同。[[annotation:1]]",
  });
  answer.finished_at = new Date().toISOString();
  await page.route("**/api/sessions/s1/messages?**", (r) =>
    r.fulfill({
      json: {
        messages: sent ? [source, sent.input, answer] : [source],
        event_cursor: null,
        is_running: false,
        has_more: false,
      },
    }),
  );
  await page.route("**/api/chat/", async (r) => {
    sent = r.request().postDataJSON();
    await r.fallback();
  });
  await page.goto("/tasks/s1");
  const original = page.locator(
    '[data-message-id="annotation-source"] .markdown',
  );
  await expect(original).toBeVisible();
  await original.evaluate((root) => {
    const range = document.createRange();
    range.selectNodeContents(root.querySelector("p")!);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.getByRole("button", { name: "添加到会话", exact: true }).click();
  await page.getByLabel("注释 1 评论").fill("确认了么？");
  await expect(page.locator(".annotation-source-marker")).toHaveCount(1);
  await expect(page.locator(".annotation-source-marker")).toHaveCSS(
    "background-color",
    "rgb(37, 99, 235)",
  );
  await expect(
    page.getByRole("button", { name: "发送消息", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect
    .poll(() => sent?.input?.metadata?.text_annotations?.[0]?.comment)
    .toBe("确认了么？");
  expect(sent.input.content[0].text).toContain("[[annotation:1]]");
  await expect(
    page.getByRole("heading", { name: "已完成研究简报" }),
  ).toBeVisible();
  await expect(page.locator(".annotation-source-marker")).toHaveCount(0);
  await page
    .locator(".annotation-answer-links")
    .getByRole("button", { name: "注释 1", exact: true })
    .click();
  await expect(
    page.locator(".annotation-highlight.is-focused"),
  ).not.toHaveCount(0);
  const detail = page.getByRole("dialog", { name: "注释 1 详情" });
  await expect(detail).toContainText("确认了么？");
  await expect(detail.locator("textarea,input")).toHaveCount(0);
  await page.reload();
  const inline = page
    .locator(".assistant-message")
    .last()
    .getByRole("link", { name: "注释 1", exact: true });
  await inline.click();
  await expect(
    page.locator(".annotation-highlight.is-focused"),
  ).not.toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "注释 1 详情" })).toContainText(
    "确认了么？",
  );
  await expect(page.locator(".annotation-source-marker")).toHaveCount(0);
  await page.screenshot({ path: "/tmp/agentkit-text-annotation-verified.png" });
});

test("dark draft annotations stay blue, can be removed, survive failed sends and do not cross sessions", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await request.post("http://127.0.0.1:38194/manager/tasks", {
    headers: { Authorization: "Bearer test-only" },
    data: {
      project_id: "project-1",
      definition_id: "personal",
      resource_view_type: "private",
      name: "另一会话",
    },
  });
  await page.addInitScript(() => {
    sessionStorage.setItem("egis_access_token", "test-only");
    localStorage.setItem("pension-gpt-theme", "dark");
  });
  await page.route("**/api/sessions/s1/messages?**", (r) =>
    r.fulfill({
      json: {
        messages: [source],
        event_cursor: null,
        is_running: false,
        has_more: false,
      },
    }),
  );
  await page.route("**/api/chat/", (r) =>
    r.fulfill({ status: 502, json: { detail: "发送失败，请重试" } }),
  );
  await page.goto("/tasks/s1");
  const add = async () => {
    await page
      .locator('[data-message-id="annotation-source"] .markdown')
      .evaluate((root) => {
        const range = document.createRange();
        range.selectNodeContents(root.querySelector("p")!);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
      });
    await page.getByRole("button", { name: "添加到会话", exact: true }).click();
  };
  await add();
  await expect(page.locator(".annotation-source-marker")).toHaveCSS(
    "background-color",
    "rgb(59, 130, 246)",
  );
  await page.locator(".annotation-source-marker").click();
  await page.getByRole("button", { name: "删除注释 1", exact: true }).click();
  await expect(page.locator(".annotation-source-marker")).toHaveCount(0);
  await expect(page.locator(".annotation-highlight")).toHaveCount(0);
  await add();
  await page.getByLabel("注释 1 评论").fill("失败时仍应保留");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "发送失败" }),
  ).toBeVisible();
  await expect(page.getByLabel("注释 1 评论")).toHaveValue("失败时仍应保留");
  await expect(page.locator(".annotation-source-marker")).toHaveCount(1);
  await page.locator('.sidebar a[href="/tasks/s2"]').click();
  await expect(page.locator(".composer .text-annotation-list")).toHaveCount(0);
  await expect(page.locator(".annotation-source-marker")).toHaveCount(0);
});

test("multiline annotations paint text once and keep a uniform tint when focused", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() => {
    sessionStorage.setItem("egis_access_token", "test-only");
    localStorage.setItem("pension-gpt-theme", "dark");
  });
  const message = {
    ...source,
    content: AssistantMsg({
      name: "personal",
      content:
        "- 右侧**形态对比**卡片：平安与泰康，业务结构不同。\n- 底部深蓝总结条：体量差四到六倍，根源在于业务形态不同。\n- 页脚注明数据来源（2025 年报合并口径）",
    }).content,
  };
  await page.route("**/api/sessions/s1/messages?**", (r) =>
    r.fulfill({
      json: {
        messages: [message],
        event_cursor: null,
        is_running: false,
        has_more: false,
      },
    }),
  );
  await page.goto("/tasks/s1");
  const original = page.locator(
    '[data-message-id="annotation-source"] .markdown',
  );
  await expect(original.locator("li")).toHaveCount(3);
  const bounds = await original.evaluate((root) => {
    const range = document.createRange();
    range.selectNodeContents(root.querySelector("ul")!);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    const rects = [...root.querySelectorAll("li")].map((li) => {
      const text = document.createRange();
      text.selectNodeContents(li);
      return text.getBoundingClientRect();
    });
    return {
      top: Math.min(...rects.map((r) => r.top)),
      right: Math.max(...rects.map((r) => r.right)),
    };
  });
  await page.getByRole("button", { name: "添加到会话", exact: true }).click();
  const coverage = () =>
    original.evaluate((root) => {
      const firstText = root.querySelector("li")!.firstChild!;
      const range = document.createRange();
      range.setStart(firstText, 1);
      range.setEnd(firstText, 2);
      const rect = range.getBoundingClientRect();
      const x = rect.x + rect.width / 2,
        y = rect.y + rect.height / 2;
      return [
        ...document.querySelectorAll<HTMLElement | SVGPathElement>(
          ".annotation-highlight",
        ),
      ].filter((el) => {
        if (el instanceof SVGPathElement) {
          const svg = el.ownerSVGElement!.getBoundingClientRect();
          return el.isPointInFill(new DOMPoint(x - svg.x, y - svg.y));
        }
        const b = el.getBoundingClientRect();
        return x > b.left && x < b.right && y > b.top && y < b.bottom;
      }).length;
    });
  await expect.poll(coverage).toBe(1);
  const highlight = page.locator(".annotation-highlight").first();
  const tint = await highlight.evaluate((el) => {
    const css = getComputedStyle(el);
    return [css.fill, css.backgroundColor];
  });
  const marker = page.locator(".annotation-source-marker");
  const badge = await marker.boundingBox();
  expect(badge!.y + badge!.height).toBeLessThanOrEqual(bounds.top + 2);
  expect(badge!.x).toBeGreaterThanOrEqual(bounds.right - 2);
  await expect(marker).toHaveCSS("border-bottom-left-radius", "0px");
  await marker.click();
  await expect.poll(coverage).toBe(1);
  expect(
    await highlight.evaluate((el) => {
      const css = getComputedStyle(el);
      return [css.fill, css.backgroundColor];
    }),
  ).toEqual(tint);
  await page.screenshot({
    path: "/tmp/agentkit-annotation-uniform-verified.png",
  });
});
