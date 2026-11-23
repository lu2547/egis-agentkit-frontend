import { test, expect } from "@playwright/test";
import type { Task } from "../../src/types/api";

test("completed scheduled conversations appear in their project with persistent unread dots and notify again on the next run", async ({
  page, request,
}, testInfo) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() => {
    sessionStorage.setItem("egis_access_token", "test-only");
    localStorage.setItem("pension-gpt-theme", "dark");
  });
  for (const path of ["schedules", "schedule-runs"]) {
    await page.route(`**/api/manager/${path}`, route => route.fulfill({ json: { items: [] } }));
  }
  let latestRun = "scheduled-run-1";
  let detailRun = latestRun;
  let title = "每日项目总结会提醒";
  const decorate = (task: Task, runId: string) => task.session_id === "s1" ? {
    ...task, name: title, source: "schedule",
    latest_schedule_run_id: runId, is_running: false,
  } : task;
  await page.route("**/api/manager/tasks", async route => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ json: { ...data, items: data.items.map((task: Task) => decorate(task, latestRun)) } });
  });
  await page.route("**/api/manager/tasks/s1", async route => {
    const response = await route.fetch();
    await route.fulfill({ json: decorate(await response.json(), detailRun) });
  });
  await page.goto("/schedules");
  const row = page.locator('.project-sessions a[href="/tasks/s1"]');
  const dot = row.getByLabel("已完成，待读", { exact: true });
  await expect(row).toContainText("每日项目总结会提醒");
  await expect(dot).toBeVisible();
  await expect(row.getByLabel("正在运行", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(dot).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(/\/tasks\/s1$/);
  await expect(dot).toHaveCount(0);
  await page.reload();
  await expect(dot).toHaveCount(0);
  await page.getByRole("link", { name: "定时任务", exact: true }).click();
  await expect(dot).toHaveCount(0);
  // Open a newer result before the sidebar has polled that completion.
  detailRun = "scheduled-run-2";
  const history = page.waitForResponse(response => response.url().includes("/sessions/s1/messages?") && response.ok());
  await row.click();
  await history;
  await page.getByRole("link", { name: "定时任务", exact: true }).click();
  latestRun = detailRun;
  title = "每日项目总结会提醒（新结果已读）";
  await expect(row).toContainText("新结果已读", { timeout: 10_000 });
  await expect(dot).toHaveCount(0);
  latestRun = detailRun = "scheduled-run-3";
  await expect(dot).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: testInfo.outputPath("scheduled-conversation-unread.png") });
  await row.click();
  await expect(dot).toHaveCount(0);
});

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
  await expect(page.locator(".running-shimmer")).toHaveCSS(
    "background-repeat",
    "no-repeat",
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

test("a finished reply stays idle when the next sidebar poll still sees its lock", async ({
  page,
  request,
}) => {
  const base = "http://127.0.0.1:38194";
  await request.post(base + "/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
  let lockHeldAfterReply = false;
  await page.route("**/api/manager/tasks", async (route) => {
    const response = await route.fetch();
    const { items } = (await response.json()) as { items: Task[] };
    await route.fulfill({
      json: {
        items: items.map((task) =>
          lockHeldAfterReply && task.session_id === "s1"
            ? { ...task, is_running: true, name: "收尾期间的会话" }
            : task,
        ),
      },
    });
  });
  await page.goto("/tasks/s1");
  const chatInput = page.locator(".composer textarea");
  const taskRow = page.locator('.sidebar a[href="/tasks/s1"]');
  const send = page.getByRole("button", { name: "发送消息", exact: true });
  await chatInput.fill("长任务：验证会话锁");
  await send.click();
  await expect(taskRow.getByLabel("正在运行")).toBeVisible();
  await expect(page.locator(".process-heading")).toContainText("正在处理");
  lockHeldAfterReply = true;
  const emitted = await request.post(base + "/__test/events", {
    data: {
      session_id: "s1",
      events: [{ type: "REPLY_END", finished_reason: "completed" }],
    },
  });
  expect(emitted.ok()).toBe(true);
  await expect(page.locator(".process-heading")).toContainText("处理时长");
  await expect(taskRow).toHaveAttribute("title", "收尾期间的会话");
  await expect(taskRow.getByLabel("正在运行")).toHaveCount(0);
  lockHeldAfterReply = false;
  await chatInput.fill("长任务：开始下一轮");
  await send.click();
  await expect(taskRow.getByLabel("正在运行")).toBeVisible();
});
