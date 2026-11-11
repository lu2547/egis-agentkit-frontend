import { test, expect, type Page } from "@playwright/test";

const api = "http://127.0.0.1:38194";
const headers = { Authorization: "Bearer test-only" };
const composer = (page: Page) => page.locator(".composer textarea");

test.beforeEach(async ({ page, request }) => {
  await request.post(`${api}/__test/reset`);
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
});

test("projects open an empty shared workspace and keep files and preview across multiple conversations", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.locator(".projects-section .section-heading").hover();
  await page.getByRole("button", { name: "新建项目", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "新建项目" });
  await dialog.getByLabel("项目名称").fill("养老险客户服务");
  await dialog.getByRole("button", { name: "创建项目", exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/project-2$/);
  await expect(
    page.getByRole("heading", { name: "今天，想一起完成什么？", exact: true }),
  ).toBeVisible();
  const panel = page.locator(".workspace-panel");
  await expect(panel).toBeVisible();
  await panel.locator('.list-toolbar input[type="file"]').setInputFiles({
    name: "客户资料.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("项目共享资料"),
  });
  await panel.locator("button.file-open").filter({ hasText: /客户资料.txt/ }).click();
  await expect(panel.locator(".text-preview")).toHaveText("项目共享资料");
  const before = await (
    await request.get(`${api}/manager/tasks`, { headers })
  ).json();
  expect(
    before.items.filter(
      (task: { project_id: string }) => task.project_id === "project-2",
    ),
  ).toHaveLength(0);

  await composer(page).fill("整理客户资料");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page).toHaveURL(/\/tasks\/s2$/);
  await expect(
    page.getByRole("heading", { name: "已完成研究简报" }),
  ).toBeVisible();
  await expect(panel.locator(".text-preview")).toHaveText("项目共享资料");
  await page
    .locator(".sidebar")
    .getByRole("link", { name: "新建任务", exact: true })
    .click();
  await expect(page).toHaveURL(/\/projects\/project-2$/);
  await expect(
    page.getByRole("heading", { name: "今天，想一起完成什么？", exact: true }),
  ).toBeVisible();
  await composer(page).fill("在同一项目中继续分析");
  await expect(composer(page)).toHaveValue("在同一项目中继续分析");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page).toHaveURL(/\/tasks\/s3$/);
  await expect(panel.locator(".text-preview")).toHaveText("项目共享资料");
  const after = await (
    await request.get(`${api}/manager/tasks`, { headers })
  ).json();
  expect(
    after.items.filter(
      (task: { project_id: string }) => task.project_id === "project-2",
    ),
  ).toHaveLength(2);
  await page.locator('.sidebar a[href="/tasks/s2"]').click();
  await expect(panel.locator(".text-preview")).toHaveText("项目共享资料");
  await page.getByRole("button", { name: "收起项目：养老险客户服务" }).click();
  await expect(page.locator('.sidebar a[href="/tasks/s2"]')).toHaveCount(0);
  await page.getByRole("button", { name: "展开项目：养老险客户服务" }).click();
  await expect(page.locator('.sidebar a[href="/tasks/s2"]')).toBeVisible();
});

test("deleting a conversation preserves project files and deleting its project confirms and removes every conversation", async ({
  page,
  request,
}) => {
  await page.goto("/tasks/s1");
  const panel = page.locator(".workspace-panel");
  await panel.locator('.list-toolbar input[type="file"]').setInputFiles({
    name: "保留资料.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("keep"),
  });
  await page
    .getByRole("button", { name: "整理行业研究与行动建议的更多操作" })
    .click();
  await page
    .getByRole("button", { name: "删除对话：整理行业研究与行动建议" })
    .click();
  const removeTask = page.getByRole("dialog", { name: "删除对话" });
  await expect(removeTask).toContainText("变更记录都会保留");
  await removeTask
    .getByRole("button", { name: "删除对话", exact: true })
    .click();
  await expect(page).toHaveURL(/\/projects\/project-1$/);
  await expect(
    page.getByRole("heading", { name: "今天，想一起完成什么？", exact: true }),
  ).toBeVisible();
  await expect(
    panel.locator("button.file-open").filter({ hasText: /保留资料.txt/ }),
  ).toBeVisible();
  const files = await (
    await request.get(`${api}/manager/projects/project-1/files?area=uploads`, {
      headers,
    })
  ).json();
  expect(files.items.map((file: { name: string }) => file.name)).toContain(
    "保留资料.txt",
  );
  const taskBody = {
    definition_id: "personal",
    resource_view_type: "private",
    project_id: "project-1",
  };
  await request.post(`${api}/manager/tasks`, { headers, data: taskBody });
  await request.post(`${api}/manager/tasks`, { headers, data: taskBody });
  await page.reload();
  await expect(page.locator(".project-group .conversation-row")).toHaveCount(2);
  await page.getByRole("button", { name: "行业研究的项目操作" }).click();
  await page.getByRole("button", { name: "删除项目：行业研究" }).click();
  const removeProject = page.getByRole("dialog", {
    name: "删除项目",
    exact: true,
  });
  await expect(removeProject).toContainText(
    "所有对话、上传资料、过程文件、产物和变更记录",
  );
  await removeProject
    .getByRole("button", { name: "取消", exact: true })
    .click();
  await expect(
    page
      .locator(".sidebar .project-select")
      .filter({ hasText: /行业研究|业务研究/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "行业研究的项目操作" }).click();
  await page.getByRole("button", { name: "删除项目：行业研究" }).click();
  await removeProject
    .getByRole("button", { name: "删除项目", exact: true })
    .click();
  await expect(page).toHaveURL("/");
  await expect(
    page
      .locator(".sidebar .project-select")
      .filter({ hasText: /行业研究|业务研究/ }),
  ).toHaveCount(0);
  expect(
    (
      await request.get(
        `${api}/manager/projects/project-1/files?area=uploads`,
        { headers },
      )
    ).status(),
  ).toBe(404);
  expect(
    (await (await request.get(`${api}/manager/tasks`, { headers })).json())
      .items,
  ).toHaveLength(0);
});

test("project rename updates navigation and a running project shows the deletion conflict", async ({
  page,
}) => {
  await page.goto("/tasks/s1");
  await page.getByRole("button", { name: "行业研究的项目操作" }).click();
  await page.getByRole("button", { name: "重命名项目", exact: true }).click();
  const rename = page.getByRole("dialog", { name: "重命名项目" });
  await rename.getByLabel("项目名称").fill("业务研究");
  await rename.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page
      .locator(".sidebar .project-select")
      .filter({ hasText: /行业研究|业务研究/ }),
  ).toHaveText("业务研究");
  await composer(page).fill("长任务：研究分析");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.locator(".task-running")).toBeVisible();
  await page.getByRole("button", { name: "业务研究的项目操作" }).click();
  await page.getByRole("button", { name: "删除项目：业务研究" }).click();
  const remove = page.getByRole("dialog", { name: "删除项目", exact: true });
  await remove.getByRole("button", { name: "删除项目", exact: true }).click();
  await expect(remove.getByRole("alert")).toContainText("有正在运行的对话");
  await expect(
    page
      .locator(".sidebar .project-select")
      .filter({ hasText: /行业研究|业务研究/ }),
  ).toBeVisible();
});

test("project names only toggle folders and never replace the current conversation", async ({
  page,
}) => {
  await page.goto("/tasks/s1");
  const row = page.locator(".project-row").filter({ hasText: "行业研究" });
  const openIcon = await row.locator(".project-select svg").innerHTML();
  await row.locator(".project-select").click();
  await expect(page).toHaveURL(/\/tasks\/s1$/);
  await expect(page.locator(".project-sessions .conversation-row")).toHaveCount(
    0,
  );
  await expect(row.locator(".project-select")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  const closedIcon = await row.locator(".project-select svg").innerHTML();
  expect(closedIcon).not.toBe(openIcon);
  await row.locator(".project-select").click();
  await expect(row.locator(".project-select")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(await row.locator(".project-select svg").innerHTML()).toBe(openIcon);
  await expect(page.locator(".project-sessions .conversation-row")).toHaveCount(
    1,
  );
  await expect(page).toHaveURL(/\/tasks\/s1$/);
});

test("composer project choice keeps the draft and scopes the new conversation and uploads", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const context = page.locator(".composer-project-bar");
  await expect(
    context.getByRole("button", { name: "选择项目", exact: true }),
  ).toHaveText("默认项目");
  await composer(page).fill("整理这份材料");
  await page.locator('.composer input[type="file"]').setInputFiles({
    name: "选择项目资料.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("目标项目材料"),
  });
  await context.getByRole("button", { name: "选择项目", exact: true }).click();
  await page.getByRole("option", { name: "行业研究", exact: true }).click();
  await expect(composer(page)).toHaveValue("整理这份材料");
  await expect(page.locator(".attachments")).toContainText("选择项目资料.txt");
  await expect(context).toContainText("行业研究");
  const contextRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/manager/composer/options?") &&
      request.url().includes("project_id=project-1"),
  );
  await composer(page).fill("@");
  await contextRequest;
  await composer(page).fill("整理这份材料");
  const created = page.waitForRequest(
    (request) =>
      request.url().endsWith("/manager/tasks") && request.method() === "POST",
  );
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  expect((await created).postDataJSON().project_id).toBe("project-1");
  await expect(page).toHaveURL(/\/tasks\/s2$/);
  const files = await (
    await request.get(`${api}/manager/projects/project-1/files?area=uploads`, {
      headers,
    })
  ).json();
  expect(files.items.map((file: { name: string }) => file.name)).toContain(
    "选择项目资料.txt",
  );
});

test("home uses the backend default project even after it is renamed", async ({
  page,
  request,
}) => {
  await request.post(`${api}/manager/projects`, {
    headers,
    data: { project_name: "日常工作" },
  });
  const response = await request.get(`${api}/manager/projects`, { headers });
  const { items } = await response.json();
  await page.route("**/api/manager/projects", (route) =>
    route.fulfill({
      json: {
        items: items.map((project: { id: string }) => ({
          ...project,
          is_default: project.id === "project-2",
        })),
      },
    }),
  );
  await page.goto("/");
  await expect(page.locator(".composer-project-bar")).toContainText("日常工作");
  await composer(page).fill("默认项目中的新会话");
  const created = page.waitForRequest(
    (request) =>
      request.url().endsWith("/manager/tasks") && request.method() === "POST",
  );
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  expect((await created).postDataJSON().project_id).toBe("project-2");
  await expect(page).toHaveURL(/\/tasks\/s2$/);
});

test("project plus opens a draft in that project without creating a session early", async ({
  page,
  request,
}) => {
  await page.goto("/tasks/s1");
  await page.locator(".project-row").filter({ hasText: "行业研究" }).hover();
  await page
    .getByRole("button", { name: "在行业研究中新建对话", exact: true })
    .click();
  await expect(page).toHaveURL(/\/projects\/project-1$/);
  await expect(
    page.getByRole("heading", { name: "今天，想一起完成什么？", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".composer-project-bar")).toContainText("行业研究");
  expect(
    (await (await request.get(`${api}/manager/tasks`, { headers })).json())
      .items,
  ).toHaveLength(1);
  await composer(page).fill("新会话共用项目工作区");
  const created = page.waitForRequest(
    (request) =>
      request.url().endsWith("/manager/tasks") && request.method() === "POST",
  );
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  expect((await created).postDataJSON().project_id).toBe("project-1");
  await expect(page).toHaveURL(/\/tasks\/s2$/);
});

test("project chooser stays beside the disclosure and supports keyboard selection in both themes", async ({
  page,
}) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "选择项目", exact: true });
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("listbox", { name: "项目列表" })).toBeVisible();
  await page.screenshot({
    path: "/private/tmp/project-selector-light.png",
    animations: "disabled",
  });
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveText("行业研究");
  await expect(page.getByRole("listbox", { name: "项目列表" })).toHaveCount(0);
  await page.getByRole("button", { name: "切换深色模式", exact: true }).click();
  await trigger.click();
  await page.screenshot({
    path: "/private/tmp/project-selector-dark.png",
    animations: "disabled",
  });
  const projectBox = await trigger.boundingBox();
  const noteBox = await page.locator(".project-composer-note").boundingBox();
  expect(projectBox!.x + projectBox!.width).toBeLessThan(noteBox!.x);
  expect(Math.abs(projectBox!.y - noteBox!.y)).toBeLessThan(8);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".sidebar")).not.toBeVisible();
  await trigger.click();
  const menu = await page
    .getByRole("listbox", { name: "项目列表" })
    .boundingBox();
  expect(menu!.x).toBeGreaterThanOrEqual(0);
  expect(menu!.x + menu!.width).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "/private/tmp/project-selector-mobile.png",
    animations: "disabled",
  });
});

test("historical conversations show their project as an immutable label beside the disclosure", async ({
  page,
}) => {
  await page.goto("/tasks/s1");
  const bar = page.locator(".composer-project-bar");
  await expect(bar.getByLabel("当前项目", { exact: true })).toHaveText(
    "行业研究",
  );
  await expect(
    bar.getByRole("button", { name: "选择项目", exact: true }),
  ).toHaveCount(0);
  await expect(bar).toContainText("内容由 AI 生成");
  await page.getByRole("button", { name: "收起项目：行业研究" }).click();
  await expect(page).toHaveURL(/\/tasks\/s1$/);
  await expect(bar.getByLabel("当前项目", { exact: true })).toHaveText(
    "行业研究",
  );
});

test("deleting the selected draft project returns the choice to default and keeps the draft", async ({
  page,
}) => {
  await page.goto("/");
  const selector = page.getByRole("button", { name: "选择项目", exact: true });
  await selector.click();
  await page.getByRole("option", { name: "行业研究", exact: true }).click();
  await composer(page).fill("保留这份草稿");
  await page.getByRole("button", { name: "行业研究的项目操作" }).click();
  await page.getByRole("button", { name: "删除项目：行业研究" }).click();
  await page
    .getByRole("dialog", { name: "删除项目", exact: true })
    .getByRole("button", { name: "删除项目", exact: true })
    .click();
  await expect(selector).toHaveText("默认项目");
  await expect(composer(page)).toHaveValue("保留这份草稿");
});
