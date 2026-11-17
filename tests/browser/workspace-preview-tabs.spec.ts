import { test, expect } from "@playwright/test";
const api = "http://127.0.0.1:38194";
test.beforeEach(async ({ page, request }) => {
  await request.post(`${api}/__test/reset`);
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
  await page.route("**/api/manager/projects/project-1/files?**", (route) =>
    route.fulfill({
      json: {
        items: ["first.txt", "second.txt"].map((name) => ({
          name,
          path: name,
          size: 20,
          is_directory: false,
        })),
      },
    }),
  );
  await page.route("**/api/manager/projects/project-1/file?**", (route) =>
    route.fulfill({
      contentType: "text/plain",
      body:
        new URL(route.request().url()).searchParams.get("path") + " content",
    }),
  );
});
test("preview tabs keep multiple files, deduplicate and restore after reload", async ({
  page,
}) => {
  await page.goto("/tasks/s1");
  const panel = page.locator(".workspace-panel");
  const nav = panel.getByRole("navigation", { name: "工作空间面板" });
  await expect(
    nav.getByRole("button", { name: "产物", exact: true }),
  ).toHaveCount(0);
  await panel.locator(".file-open").filter({ hasText: "first.txt" }).click();
  await expect(
    panel.getByRole("tab", { name: "first.txt", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(panel.getByRole("button", { name: /返回/ })).toHaveCount(0);
  await expect(panel.locator(".file-preview > header")).toHaveCount(0);
  await nav.getByRole("button", { name: "文件", exact: true }).click();
  await panel.locator(".file-open").filter({ hasText: "second.txt" }).click();
  await expect(panel.getByRole("tab")).toHaveCount(2);
  await expect(panel.locator(".file-preview:visible .text-preview")).toHaveText(
    "second.txt content",
  );
  await panel.getByRole("tab", { name: "first.txt", exact: true }).click();
  await expect(panel.locator(".file-preview:visible .text-preview")).toHaveText(
    "first.txt content",
  );
  await nav.getByRole("button", { name: "文件", exact: true }).click();
  await panel.locator(".file-open").filter({ hasText: "first.txt" }).click();
  await expect(panel.getByRole("tab")).toHaveCount(2);
  await page.reload();
  await expect(panel.getByRole("tab")).toHaveCount(2);
  await expect(
    panel.getByRole("tab", { name: "first.txt", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await panel
    .getByRole("button", { name: "关闭预览 first.txt", exact: true })
    .click();
  await expect(
    panel.getByRole("tab", { name: "second.txt", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(panel.locator(".file-preview:visible .text-preview")).toHaveText(
    "second.txt content",
  );
});

test("file-tab keyboard navigation and close are scoped to the current conversation", async ({
  page,
  request,
}) => {
  await request.post(`${api}/manager/tasks`, {
    headers: { Authorization: "Bearer test-only" },
    data: {
      project_id: "project-1",
      definition_id: "personal",
      resource_view_type: "private",
      name: "第二个对话",
    },
  });
  await page.goto("/tasks/s1");
  const panel = page.locator(".workspace-panel");
  await panel.locator(".file-open").filter({ hasText: "first.txt" }).click();
  await panel
    .getByRole("navigation", { name: "工作空间面板" })
    .getByRole("button", { name: "文件", exact: true })
    .click();
  await panel.locator(".file-open").filter({ hasText: "second.txt" }).click();
  const second = panel.getByRole("tab", { name: "second.txt", exact: true });
  await second.focus();
  await second.press("ArrowLeft");
  await expect(
    panel.getByRole("tab", { name: "first.txt", exact: true }),
  ).toBeFocused();
  await expect(
    panel.getByRole("tab", { name: "first.txt", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.locator('.sidebar a[href="/tasks/s2"]').click();
  await expect(panel.getByRole("tab")).toHaveCount(0);
  await page.locator('.sidebar a[href="/tasks/s1"]').click();
  await expect(panel.getByRole("tab")).toHaveCount(2);
  await expect(
    panel.getByRole("tab", { name: "first.txt", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});

test("an open preview follows tool writes before the reply finishes", async ({
  page,
  request,
}) => {
  let content = "original diagram";
  await page.route("**/api/manager/projects/project-1/file?**", (route) =>
    route.fulfill({ contentType: "text/plain", body: content }),
  );
  await page.goto("/tasks/s1");
  const panel = page.locator(".workspace-panel");
  await panel.locator(".file-open").filter({ hasText: "first.txt" }).click();
  const preview = panel.locator(".file-preview:visible .text-preview");
  await expect(preview).toHaveText("original diagram");
  await page
    .locator(".composer > .t-textarea textarea")
    .fill("长任务：更新图表");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "停止生成", exact: true }),
  ).toBeVisible();
  content = "updated diagram";
  await request.post(`${api}/__test/events`, {
    data: {
      session_id: "s1",
      events: [
        {
          type: "TOOL_CALL_START",
          tool_call_id: "write-1",
          tool_call_name: "Write",
        },
        { type: "TOOL_CALL_END", tool_call_id: "write-1" },
        {
          type: "TOOL_RESULT_START",
          tool_call_id: "write-1",
          tool_call_name: "Write",
        },
        { type: "TOOL_RESULT_END", tool_call_id: "write-1", state: "success" },
      ],
    },
  });
  await expect(preview).toHaveText("updated diagram");
  await expect(
    page.getByRole("button", { name: "停止生成", exact: true }),
  ).toBeVisible();
  content = "final diagram";
  await request.post(`${api}/__test/events`, {
    data: {
      session_id: "s1",
      events: [{ type: "REPLY_END", finished_reason: "completed" }],
    },
  });
  await expect(preview).toHaveText("final diagram");
  content = "manually updated diagram";
  await panel.getByRole("button", { name: "刷新文件", exact: true }).click();
  await expect(preview).toHaveText("manually updated diagram");
});

test("refresh during initial loading completes the new request rather than keeping a partial preview", async ({
  page,
}) => {
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const initialOptions = page.waitForResponse((response) =>
    response.url().endsWith("/preview-options"),
  );
  await page.goto("/tasks/s1");
  await initialOptions;
  await page.route(
    "**/api/manager/projects/project-1/preview-options",
    async (route) => {
      if (++calls === 1) await delayed;
      await route.continue();
    },
  );
  try {
    const panel = page.locator(".workspace-panel");
    await panel.locator(".file-open").filter({ hasText: "first.txt" }).click();
    await expect.poll(() => calls).toBe(1);
    await page
      .locator(".composer > .t-textarea textarea")
      .fill("长任务：读取期间继续工作");
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect(panel.locator(".text-preview")).toHaveText(
      "first.txt content",
    );
  } finally {
    release();
  }
});

test("refreshing unchanged content preserves image selections and notes", async ({
  page,
}) => {
  await page.route("**/api/manager/projects/project-1/file?**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="white"/></svg>',
    }),
  );
  await page.goto("/tasks/s1");
  const panel = page.locator(".workspace-panel");
  await panel.locator(".file-open").filter({ hasText: "first.txt" }).click();
  const image = panel.locator(".preview-image");
  await expect(image).toBeVisible();
  const source = await image.getAttribute("src");
  await panel.getByRole("button", { name: "框选", exact: true }).click();
  const layer = panel.getByLabel("文件框选区域");
  const bounds = (await layer.boundingBox())!;
  await page.mouse.move(
    bounds.x + bounds.width * 0.1,
    bounds.y + bounds.height * 0.1,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width * 0.6,
    bounds.y + bounds.height * 0.5,
  );
  await page.mouse.up();
  await panel.getByLabel("区域 1 备注").fill("保留我的批注");
  const refreshed = page.waitForResponse((response) =>
    response.url().includes("/file?"),
  );
  await panel.getByRole("button", { name: "刷新文件", exact: true }).click();
  await (await refreshed).finished();
  await expect(image).toHaveAttribute("src", source!);
  await expect(panel.getByLabel("区域 1 备注")).toHaveValue("保留我的批注");
});
