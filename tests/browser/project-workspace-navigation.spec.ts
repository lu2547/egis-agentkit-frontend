import { test, expect } from "@playwright/test";
const api = "http://127.0.0.1:38194";
const headers = { Authorization: "Bearer test-only" };

test.beforeEach(async ({ page, request }) => {
  await request.post(`${api}/__test/reset`);
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
});

test("default project actions follow is_default rather than its display name", async ({
  page,
}) => {
  await page.route("**/api/manager/projects", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.items = data.items.map((item: object) => ({
      ...item,
      is_default: true,
    }));
    await route.fulfill({ response, json: data });
  });
  await page.goto("/tasks/s1");
  await page.getByRole("button", { name: "行业研究的项目操作" }).click();
  await expect(
    page.getByRole("button", { name: "重命名项目", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "删除项目：行业研究", exact: true }),
  ).toHaveCount(0);
});

test("selecting a project name switches the workspace to that project", async ({
  page,
  request,
}) => {
  await request.post(`${api}/manager/projects`, {
    headers,
    data: { project_name: "第二个项目" },
  });
  await request.post(`${api}/manager/projects/project-2/files`, {
    headers,
    multipart: {
      file: {
        name: "second.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("第二个项目资料"),
      },
    },
  });
  await page.goto("/tasks/s1");
  await page
    .locator(".sidebar .project-select")
    .filter({ hasText: "第二个项目" })
    .click();
  await expect(page).toHaveURL(/\/projects\/project-2$/);
  const panel = page.locator(".workspace-panel");
  await expect(panel).toBeVisible();
  await expect(
    panel.locator(".file-open").filter({ hasText: "second.txt" }),
  ).toBeVisible();
});

test("same-project sessions keep separate preview state while sharing files", async ({
  page,
  request,
}) => {
  const response = await request.post(`${api}/manager/tasks`, {
    headers,
    data: {
      definition_id: "personal",
      resource_view_type: "private",
      project_id: "project-1",
      name: "第二个会话",
    },
  });
  const second = await response.json();
  await request.post(`${api}/manager/projects/project-1/files`, {
    headers,
    multipart: {
      file: {
        name: "shared.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("同项目共享资料"),
      },
    },
  });
  await page.goto("/tasks/s1");
  const panel = page.locator(".workspace-panel");
  await panel.locator(".file-open").filter({ hasText: "shared.txt" }).click();
  await expect(panel.locator(".text-preview")).toContainText("同项目共享资料");
  await page.locator(`.sidebar a[href="/tasks/${second.session_id}"]`).click();
  await expect(panel.locator(".file-preview")).toHaveCount(0);
  await expect(
    panel.locator(".file-open").filter({ hasText: "shared.txt" }),
  ).toBeVisible();
  await page.locator('.sidebar a[href="/tasks/s1"]').click();
  await expect(panel.locator(".text-preview")).toContainText("同项目共享资料");
});

for (const area of ["icon", "name", "blank"] as const) {
  test(`project ${area} switches files and toggles on every click`, async ({
    page,
    request,
  }) => {
    await request.post(`${api}/manager/projects`, {
      headers,
      data: { project_name: "默认项目" },
    });
    await request.post(`${api}/manager/projects/project-2/files`, {
      headers,
      multipart: {
        file: {
          name: "default.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("default project"),
        },
      },
    });
    await page.goto("/tasks/s1");
    const row = page.locator(".project-row").filter({ hasText: "默认项目" });
    const toggle = row.locator(".project-toggle");
    const click = () =>
      area === "icon"
        ? toggle.locator("svg").click()
        : area === "name"
          ? row.locator(".project-select span").click()
          : row
              .locator(".project-select")
              .click({ position: { x: 150, y: 18 } });
    await click();
    await expect(page).toHaveURL(/\/projects\/project-2$/);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(
      page
        .locator(".workspace-panel .file-open")
        .filter({ hasText: "default.txt" }),
    ).toBeVisible();
    await click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await row.getByRole("button", { name: "默认项目的项目操作" }).click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(
      page.getByRole("button", { name: "重命名项目", exact: true }),
    ).toBeVisible();
  });
}
