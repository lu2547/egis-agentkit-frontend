import { test, expect } from "@playwright/test";
test("running tasks show a spinner, latest activity shimmers and background completion becomes unread", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
  let finished = false;
  const task = {
    session_id: "s1",
    agent_id: "a1",
    name: "整理行业研究与行动建议",
    definition_id: "expert-0",
    definition_display_name: "研究分析专家",
    updated_at: "2026-11-04T00:00:00Z",
  };
  await page.route("**/api/manager/tasks", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            ...task,
            is_running: !finished,
            updated_at: finished ? "2026-11-05T01:00:00Z" : task.updated_at,
          },
        ],
      },
    }),
  );
  await page.goto("/tasks/s1");
  await page.locator(".composer textarea").fill("长任务：运行状态测试");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.locator(".latest-activity")).toContainText("正在思考");
  await expect(page.locator(".process-heading")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(page.locator(".stop-glyph")).toHaveCSS("border-radius", "3px");
  await expect(page.locator(".task-running")).toBeVisible();
  await request.post("http://127.0.0.1:38194/__test/events", {
    data: {
      session_id: "s1",
      events: [
        {
          type: "TOOL_CALL_START",
          tool_call_id: "cmd",
          tool_call_name: "Bash",
        },
        {
          type: "TOOL_CALL_DELTA",
          tool_call_id: "cmd",
          delta: '{"command":"python report.py"}',
        },
        { type: "TOOL_CALL_END", tool_call_id: "cmd" },
      ],
    },
  });
  await expect(page.locator(".latest-activity")).toContainText(
    "python report.py",
  );
  await expect(page.locator(".running-shimmer")).toHaveCSS(
    "animation-name",
    /activity-shimmer/,
  );
  await page
    .getByRole("link", { name: "新建任务", exact: true })
    .first()
    .click();
  await expect(page.locator(".task-running")).toBeVisible();
  finished = true;
  await expect(page.getByLabel("已完成，待读", { exact: true })).toBeVisible({
    timeout: 12000,
  });
  await expect(page.locator(".task-running")).toHaveCount(0);
  await page.locator('.sidebar a[href="/tasks/s1"]').click();
  await expect(page.getByLabel("已完成，待读", { exact: true })).toHaveCount(0);
});
