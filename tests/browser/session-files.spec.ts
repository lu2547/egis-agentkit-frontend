import { test, expect } from "@playwright/test";
const api = "http://127.0.0.1:38194";
test.beforeEach(async ({ page, request }) => {
  await request.post(api + "/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
});
test("selection uploads into the current session before sending, refreshes uploads and is not uploaded twice", async ({
  page,
}) => {
  let count = 0;
  await page.route("**/api/manager/projects/project-1/files?**", (route) => {
    const area = new URL(route.request().url()).searchParams.get("area");
    const file = {
      name: "资料.txt",
      path: "资料.txt",
      area: "uploads",
      size: 5,
      is_directory: false,
      modified_at: "",
    };
    if (route.request().method() === "POST") {
      count++;
      expect(area).toBe("uploads");
      return route.fulfill({ json: file });
    }
    return route.fulfill({
      json: { items: area === "uploads" && count ? [file] : [] },
    });
  });
  await page.goto("/tasks/s1");
  await expect(page.getByLabel("当前专家", { exact: true })).toContainText(
    "研究分析专家",
  );
  const panel = page.locator(".workspace-panel");
  await page.locator('.composer input[type="file"]').setInputFiles({
    name: "资料.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello"),
  });
  await expect(panel.getByRole("button", { name: /资料.txt/ })).toBeVisible();
  expect(count).toBe(1);
  await page.locator(".composer textarea").fill("阅读资料");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "已完成研究简报" }),
  ).toBeVisible();
  expect(count).toBe(1);
  await expect(page.getByLabel("当前专家", { exact: true })).toContainText(
    "研究分析专家",
  );
});
test("home retries a rejected attachment on the same prepared task", async ({
  page,
}) => {
  let created = 0,
    uploads = 0;
  const task = {
    session_id: "retry",
    agent_id: "a1",
    name: "重试会话",
    definition_id: "personal",
    definition_display_name: "个人助理",
    updated_at: "",
  };
  await page.route("**/api/manager/tasks", async (route) => {
    if (route.request().method() === "POST") {
      created++;
      return route.fulfill({ json: task });
    }
    return route.continue();
  });
  await page.route("**/api/manager/tasks/retry", (route) =>
    route.fulfill({ json: task }),
  );
  await page.route("**/api/manager/tasks/retry/files?**", (route) => {
    if (route.request().method() !== "POST")
      return route.fulfill({ json: { items: [] } });
    uploads++;
    return uploads === 1
      ? route.fulfill({ status: 403, json: { detail: "上传暂未开放" } })
      : route.fulfill({
          json: {
            name: "a.txt",
            path: "a.txt",
            area: "uploads",
            size: 1,
            is_directory: false,
          },
        });
  });
  await page.goto("/");
  await page.locator('.composer input[type="file"]').setInputFiles({
    name: "a.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("a"),
  });
  await page.locator(".composer textarea").fill("发送附件");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("上传暂未开放");
  await expect(page.locator(".composer textarea")).toHaveValue("发送附件");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page).toHaveURL("/tasks/retry");
  expect(created).toBe(1);
  expect(uploads).toBe(2);
});
for (const theme of ["light", "dark"] as const)
  test(`form fields keep one thin edge and page scrolling reaches the main edge in ${theme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("/experts/new");
    const pageBox = page.locator(".edit-page"),
      main = page.locator(".workbench-main");
    await expect(pageBox).toBeVisible();
    const [box, container] = await Promise.all([
      pageBox.boundingBox(),
      main.boundingBox(),
    ]);
    expect(
      Math.abs(box!.x + box!.width - container!.x - container!.width),
    ).toBeLessThan(2);
    const textarea = page.locator("textarea").first();
    await textarea.focus();
    await expect(textarea).toHaveCSS("box-shadow", "none");
    await expect(textarea).toHaveCSS("outline-style", "none");
    await expect(textarea).toHaveCSS("border-top-width", "1px");
  });
