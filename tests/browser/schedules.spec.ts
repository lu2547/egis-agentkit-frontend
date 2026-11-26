import { expect, test } from "@playwright/test";

const timestamp = "2026-11-23T09:00:00+08:00";

const weekly = {
  id: "schedule-1",
  name: "每周研究周报",
  description: "汇总行业动态",
  enabled: true,
  project_id: "project-1",
  model_key: null,
  permission_mode: "dont_ask",
  timezone: "Asia/Shanghai",
  rule: { kind: "weekly", time: "17:00", weekdays: [4] },
  user_id: "demo",
  agent_id: "a1",
  next_run_at: "2026-11-27T09:00:00Z",
  created_at: timestamp,
  updated_at: timestamp,
};
const paused = {
  ...weekly,
  id: "schedule-2",
  name: "会前材料检查",
  enabled: false,
};

test.beforeEach(async ({ page, request }) => {
  await request.post("/api/__test/reset");
  await page.addInitScript(() => {
    sessionStorage.setItem("egis_access_token", "test-only");
    localStorage.setItem("pension-gpt-theme", "dark");
  });
});

test("a task card confirms single deletion without opening its detail", async ({
  page,
}) => {
  let items = [weekly, paused];
  const deletions: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "DELETE")
      deletions.push(new URL(request.url()).pathname);
  });
  await page.route(/\/manager\/schedules$/, (route) =>
    route.fulfill({ json: { items } }),
  );
  await page.route("**/manager/schedules/schedule-1", (route) => {
    expect(route.request().method()).toBe("DELETE");
    items = [paused];
    return route.fulfill({ status: 204 });
  });
  await page.goto("/schedules");
  const card = page.getByRole("article", { name: weekly.name, exact: true });
  const remove = card.getByRole("button", { name: "删除定时任务" });
  await expect(remove).toBeVisible();
  await remove.click();
  const dialog = page.getByRole("dialog", { name: "删除定时任务" });
  await expect(dialog).toContainText(weekly.name);
  await expect(page).toHaveURL(/\/schedules$/);
  expect(deletions).toEqual([]);
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(deletions).toEqual([]);
  await expect(card).toBeVisible();

  await remove.click();
  await dialog.getByRole("button", { name: "删除", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(card).toHaveCount(0);
  await expect(
    page.getByRole("article", { name: paused.name, exact: true }),
  ).toBeVisible();
  expect(deletions).toEqual(["/api/manager/schedules/schedule-1"]);
  await expect(page).toHaveURL(/\/schedules$/);
});

test("detail deletion retains the task after failure and returns to the list after retry", async ({
  page,
}) => {
  let items = [weekly, paused];
  let attempts = 0;
  await page.route(/\/manager\/schedules$/, (route) =>
    route.fulfill({ json: { items } }),
  );
  await page.route(/\/manager\/schedule-runs(?:\?|$)/, (route) =>
    route.fulfill({ json: { items: [] } }),
  );
  await page.route("**/manager/schedules/schedule-1", (route) => {
    expect(route.request().method()).toBe("DELETE");
    attempts++;
    if (attempts === 1)
      return route.fulfill({
        status: 503,
        json: { detail: "服务暂时不可用，请重试" },
      });
    items = [paused];
    return route.fulfill({ status: 204 });
  });
  await page.goto("/schedules?detail=schedule-1");
  const remove = page.getByRole("button", { name: "删除定时任务" });
  await expect(remove).toBeVisible();
  await remove.click();
  const dialog = page.getByRole("dialog", { name: "删除定时任务" });
  await dialog.getByRole("button", { name: "删除", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("服务暂时不可用，请重试");
  await expect(page).toHaveURL(/detail=schedule-1/);
  await expect(page.getByRole("heading", { name: weekly.name })).toBeVisible();
  await expect(remove).toBeVisible();

  await dialog.getByRole("button", { name: "删除", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/schedules$/);
  await expect(
    page.getByRole("article", { name: weekly.name, exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("article", { name: paused.name, exact: true }),
  ).toBeVisible();
  expect(attempts).toBe(2);
});

test("both conversation creation entry points prefill the new task composer", async ({
  page,
}) => {
  const prompt = "帮我创建一个定时任务：";
  const posted: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST")
      posted.push(new URL(request.url()).pathname);
  });
  await page.route(/\/manager\/schedules$/, (route) =>
    route.fulfill({ json: { items: [] } }),
  );

  for (const fromMenu of [true, false]) {
    await page.goto("/schedules");
    if (fromMenu) await page.getByRole("button", { name: "新建方式" }).click();
    await page
      .getByRole("button", {
        name: fromMenu ? "从对话新建" : "新建",
        exact: true,
      })
      .click();

    await expect(page).toHaveURL(/\/\?prompt=/);
    const input = page.locator(".composer textarea");
    await expect(input).toHaveValue(prompt);
    await expect(input).toBeFocused();
    expect(
      await input.evaluate((element: HTMLTextAreaElement) => [
        element.selectionStart,
        element.selectionEnd,
      ]),
    ).toEqual([prompt.length, prompt.length]);
  }

  expect(
    posted.filter((path) =>
      /^\/api\/(manager\/(tasks|schedules)|chat)\/?$/.test(path),
    ),
  ).toEqual([]);
});

test("weekly template opens the editable schedule form and saves the chosen time", async ({
  page,
}, testInfo) => {
  const instruction =
    "汇总项目本周进展、风险和下周行动，生成项目周报并保存到项目产物。";
  await page.route(/\/manager\/schedules$/, (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { items: [] } });
    const payload = route.request().postDataJSON();
    expect(payload).toMatchObject({
      name: "项目进度周报",
      description: instruction,
      project_id: "project-1",
      permission_mode: "dont_ask",
      timezone: "Asia/Shanghai",
      rule: { kind: "weekly", time: "18:00", weekdays: [4] },
    });
    return route.fulfill({ status: 201, json: { ...weekly, ...payload } });
  });
  await page.route("**/manager/schedules/preview", (route) => {
    const payload = route.request().postDataJSON();
    expect(payload).toEqual({
      timezone: "Asia/Shanghai",
      enabled: true,
      starts_on: null,
      ends_on: null,
      rule: { kind: "weekly", time: payload.rule.time, weekdays: [4] },
    });
    return route.fulfill({
      json: {
        next_run_at:
          payload.rule.time === "18:00"
            ? "2026-11-27T10:00:00Z"
            : "2026-11-27T09:00:00Z",
      },
    });
  });
  await page.goto("/");
  await page.getByRole("link", { name: "定时任务", exact: true }).click();
  await page.getByRole("button", { name: "新建方式" }).click();
  await page.getByRole("button", { name: "从模板新建" }).click();
  await page.getByRole("button", { name: /每周项目周报/ }).click();

  const editor = page.getByRole("dialog", { name: "新建定时任务" });
  await expect(editor.getByLabel("执行内容")).toHaveValue(instruction);
  await expect(editor.getByRole("combobox", { name: "重复方式" })).toHaveText(
    "每周",
  );
  await expect(editor.getByRole("checkbox", { name: "周五" })).toBeChecked();
  await expect(editor.getByLabel("执行时间")).toHaveValue("17:00");
  await editor.getByLabel("任务名称").fill("项目进度周报");
  const project = editor.getByRole("combobox", { name: "项目", exact: true });
  await project.click();
  await page
    .getByRole("listbox", { name: "项目", exact: true })
    .getByRole("option", { name: "行业研究", exact: true })
    .click();
  await editor.getByLabel("执行时间").fill("18:00");
  await expect(
    editor.getByText("下次运行 2026-11-27 18:00", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("schedule-editor.png"),
    animations: "disabled",
  });
  await editor.getByRole("button", { name: "确定" }).click();
  await expect(
    page.getByRole("button", { name: "项目进度周报", exact: true }),
  ).toBeVisible();
});

test("batch selection survives a status filter and deletes both selected tasks", async ({
  page,
}, testInfo) => {
  await page.route(/\/manager\/schedules$/, (route) =>
    route.fulfill({
      json: { items: [weekly, paused] },
    }),
  );
  await page.route("**/manager/schedules/batch-delete", (route) => {
    expect(route.request().postDataJSON()).toEqual({
      ids: ["schedule-1", "schedule-2"],
    });
    return route.fulfill({ status: 204 });
  });
  await page.goto("/schedules");
  await expect(
    page.getByRole("button", { name: weekly.name, exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("schedule-list.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "批量管理" }).click();
  await page.getByRole("button", { name: /已启用/ }).click();
  await page.getByRole("checkbox", { name: "全选" }).check();
  await page.getByRole("button", { name: /已暂停/ }).click();
  await page.getByRole("checkbox", { name: "选择会前材料检查" }).check();
  await expect(page.getByText("已选中 2 项")).toBeVisible();
  await page.getByRole("button", { name: "删除", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "删除", exact: true })
    .click();
  await page.getByRole("button", { name: /^全部/ }).click();
  await expect(
    page.getByRole("button", { name: weekly.name, exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: paused.name, exact: true }),
  ).toHaveCount(0);
});

test("run filters show padded options and support keyboard selection", async ({
  page,
}) => {
  await page.route(/\/manager\/schedules$/, (route) =>
    route.fulfill({ json: { items: [weekly] } }),
  );
  await page.route(/\/manager\/schedule-runs(?:\?|$)/, (route) =>
    route.fulfill({ json: { items: [] } }),
  );
  await page.goto("/schedules?view=runs");
  const environment = page.getByRole("combobox", { name: "执行环境" });
  await environment.click();
  const menu = page.getByRole("listbox", { name: "执行环境" });
  const all = menu.getByRole("option", { name: "全部类型" });
  await expect(all).toHaveAttribute("aria-selected", "true");
  expect(
    await menu.evaluate((element) =>
      parseFloat(getComputedStyle(element).paddingLeft),
    ),
  ).toBeGreaterThanOrEqual(6);

  await environment.press("ArrowDown");
  await environment.press("Enter");
  await expect(environment).toHaveText("企业沙箱");
  await expect(menu).toBeHidden();
  await expect(environment).toBeFocused();

  const status = page.getByRole("combobox", { name: "运行状态" });
  await status.click();
  await page.getByRole("option", { name: "成功", exact: true }).click();
  await expect(page).toHaveURL(/status=succeeded/);

  const task = page.getByRole("combobox", { name: "按任务筛选" });
  await task.click();
  await page.getByRole("searchbox", { name: "搜索任务名称" }).fill("研究");
  await page.getByRole("option", { name: weekly.name, exact: true }).click();
  await expect(page).toHaveURL(/task=schedule-1/);
});

test("test runs stay on the task timeline and can be archived from filtered history", async ({
  page,
}, testInfo) => {
  let queued = false;
  let archived = false;
  const run = {
    id: "run-1",
    schedule_id: weekly.id,
    schedule_name: weekly.name,
    project_id: weekly.project_id,
    trigger_type: "test",
    status: "succeeded",
    created_at: timestamp,
    started_at: timestamp,
    finished_at: "2026-11-23T09:00:12+08:00",
    session_id: "s1",
    reply_id: "reply-1",
    summary: "本周行业摘要",
  };
  await page.route(/\/manager\/schedules$/, (route) =>
    route.fulfill({ json: { items: [weekly] } }),
  );
  await page.route("**/manager/schedules/schedule-1/run", (route) => {
    expect(route.request().method()).toBe("POST");
    queued = true;
    return route.fulfill({ status: 202, json: { ...run, status: "queued" } });
  });
  await page.route("**/manager/schedule-runs/run-1", (route) => {
    expect(route.request().postDataJSON()).toEqual({ archived: true });
    archived = true;
    return route.fulfill({ json: { ...run, archived_at: timestamp } });
  });
  await page.route(/\/manager\/schedule-runs(?:\?|$)/, (route) => {
    const query = new URL(route.request().url()).searchParams;
    const items =
      queued &&
      (query.get("archived") === "true") === archived &&
      (!query.get("schedule_id") || query.get("schedule_id") === weekly.id)
        ? [{ ...run, archived_at: archived ? timestamp : null }]
        : [];
    return route.fulfill({ json: { items } });
  });
  await page.goto("/schedules");
  await page.getByRole("button", { name: weekly.name, exact: true }).click();
  await page.getByRole("button", { name: "测试运行", exact: true }).click();
  await page
    .getByRole("dialog", { name: "测试运行" })
    .getByRole("button", { name: "测试运行" })
    .click();
  await expect(page.getByText("本周行业摘要")).toBeVisible();
  await expect(page.getByRole("link", { name: "查看会话" })).toHaveAttribute(
    "href",
    "/tasks/s1?reply_id=reply-1",
  );
  await page.getByRole("button", { name: "查看该任务运行记录" }).click();
  await expect(page).toHaveURL(/view=runs&task=schedule-1/);
  await expect(page.getByRole("row", { name: /每周研究周报/ })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("schedule-history.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "归档", exact: true }).click();
  await expect(page.getByRole("row", { name: /每周研究周报/ })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "查看已归档" }).check();
  await expect(page.getByRole("row", { name: /每周研究周报/ })).toBeVisible();
});

test("a run opens its reply from an older page in a reused conversation", async ({
  page,
}) => {
  const message = (id: string, text: string) => ({
    id,
    name: "个人助理",
    role: "assistant",
    created_at: timestamp,
    finished_at: timestamp,
    content: [{ type: "text", text }],
  });
  await page.route(/\/sessions\/s1\/messages(?:\?|$)/, (route) => {
    const query = new URL(route.request().url()).searchParams;
    const older = query.get("before") === "recent-reply";
    return route.fulfill({
      json: {
        messages: older
          ? [message("reply-1", "所选运行的回复")]
          : [message("recent-reply", "较新的回复")],
        event_cursor: null,
        is_running: false,
        has_more: !older,
      },
    });
  });
  await page.goto("/tasks/s1?reply_id=reply-1");
  const reply = page.locator('[data-message-id="reply-1"]');
  await expect(
    reply.getByText("所选运行的回复", { exact: true }),
  ).toBeInViewport({ timeout: 3500 });
  await expect(reply).toBeFocused();
});
