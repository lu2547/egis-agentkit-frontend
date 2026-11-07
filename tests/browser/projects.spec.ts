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
  await page.getByRole("button", { name: "新建项目", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "新建项目" });
  await dialog.getByLabel("项目名称").fill("养老险客户服务");
  await dialog.getByRole("button", { name: "创建项目", exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/project-2$/);
  await expect(
    page.getByRole("heading", { name: "养老险客户服务", exact: true }),
  ).toBeVisible();
  const panel = page.locator(".workspace-panel");
  await expect(panel).toBeVisible();
  await panel
    .locator('.list-toolbar input[type="file"]')
    .setInputFiles({
      name: "客户资料.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("项目共享资料"),
    });
  await panel.getByRole("button", { name: /客户资料.txt/ }).click();
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
  await composer(page).fill("在同一项目中继续分析");
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
  await panel
    .locator('.list-toolbar input[type="file"]')
    .setInputFiles({
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
    panel.getByRole("button", { name: /保留资料.txt/ }),
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
    page.locator('.sidebar a[href="/projects/project-1"]'),
  ).toBeVisible();
  await page.getByRole("button", { name: "行业研究的项目操作" }).click();
  await page.getByRole("button", { name: "删除项目：行业研究" }).click();
  await removeProject
    .getByRole("button", { name: "删除项目", exact: true })
    .click();
  await expect(page).toHaveURL("/");
  await expect(
    page.locator('.sidebar a[href="/projects/project-1"]'),
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
    page.locator('.sidebar a[href="/projects/project-1"]'),
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
    page.locator('.sidebar a[href="/projects/project-1"]'),
  ).toBeVisible();
});
