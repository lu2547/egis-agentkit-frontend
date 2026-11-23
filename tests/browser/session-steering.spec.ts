import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
  await page.goto("/tasks/s1");
  await page.locator(".composer textarea").fill("长任务：生成报告");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "停止生成", exact: true }),
  ).toBeVisible();
});

test("restores several queued inputs after reload and supports server edits, order, delete and injection", async ({
  page,
}) => {
  const input = page.locator(".composer > .t-textarea textarea");
  for (const text of ["先看预算", "颜色用蓝色", "保留原始文件"]) {
    await input.fill(text);
    await page.getByRole("button", { name: "加入引导队列" }).click();
    await expect(input).toHaveValue("");
  }
  await page.reload();
  await expect(page.locator(".steering-queue-row")).toHaveCount(3);
  await page.getByRole("button", { name: "编辑第 2 条引导" }).click();
  await page.getByLabel("第 2 条引导内容").fill("颜色改为橙色");
  await page.getByLabel("第 2 条引导内容").press("Enter");
  await expect(page.locator(".steering-queue-row").nth(1)).toContainText(
    "颜色改为橙色",
  );
  await page
    .getByRole("button", { name: "移动第 3 条引导" })
    .press("Alt+ArrowUp");
  await expect(page.locator(".steering-queue-row").nth(1)).toContainText(
    "保留原始文件",
  );
  await page.getByRole("button", { name: "删除第 1 条引导" }).click();
  await expect(page.locator(".steering-queue-row")).toHaveCount(2);
  const ids: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/steer")) ids.push(r.url());
  });
  await page.getByRole("button", { name: "全部引导", exact: true }).click();
  await expect(page.locator(".steering-queue-row")).toHaveCount(0);
  await expect(
    page.locator(".user-message").filter({ hasText: "保留原始文件" }),
  ).toContainText("已接收");
  await expect(
    page.locator(".user-message").filter({ hasText: "颜色改为橙色" }),
  ).toContainText("已接收");
  expect(ids).toHaveLength(2);
  await expect(
    page.getByRole("button", { name: "停止生成", exact: true }),
  ).toBeVisible();
});

test("keeps failed injection editable and retries the same pending item", async ({
  page,
}) => {
  const paths: string[] = [];
  await page.route("**/api/chat/queue/*/steer", async (route) => {
    paths.push(route.request().url());
    if (paths.length === 1)
      return route.fulfill({
        status: 503,
        json: { detail: "暂时不可用，请重试" },
      });
    await route.continue();
  });
  const input = page.locator(".composer > .t-textarea textarea");
  await input.fill("先确认预算");
  await page.getByRole("button", { name: "加入引导队列" }).click();
  await page.getByRole("button", { name: "发送第 1 条引导" }).click();
  await expect(page.locator(".steering-queue-row")).toContainText("重试");
  await page.getByRole("button", { name: "发送第 1 条引导" }).click();
  await expect(page.locator(".steering-queue-row")).toHaveCount(0);
  expect(paths).toHaveLength(2);
  expect(paths[0]).toBe(paths[1]);
});

for (const [platform, shortcut] of [
  ["MacIntel", "Meta+Enter"],
  ["Win32", "Alt+Enter"],
  ["Win32", "Control+Enter"],
]) {
  test(`queues without injecting on ${platform} using ${shortcut}`, async ({
    page,
  }) => {
    await page.addInitScript(
      (value) =>
        Object.defineProperty(navigator, "platform", { get: () => value }),
      platform,
    );
    await page.reload();
    const input = page.locator(".composer > .t-textarea textarea");
    // 运行状态由服务端保存，刷新后继续向同一个回复排队。
    const injections: unknown[] = [];
    page.on("request", (r) => {
      if (r.url().endsWith("/steer")) injections.push(r.postDataJSON());
    });
    await input.fill("补充要求");
    await input.press("Enter");
    await expect(input).toHaveValue("补充要求\n");
    await input.press(shortcut!);
    await expect(page.locator(".steering-queue-row")).toHaveCount(1);
    await expect(input).toHaveValue("");
    expect(injections).toHaveLength(0);
    await page.getByRole("button", { name: "发送第 1 条引导" }).click();
    await expect(page.locator(".steering-queue-row")).toHaveCount(0);
    expect(injections).toHaveLength(1);
  });
}

test("keeps attachments and permits another queue submission while injection is pending", async ({
  page,
}) => {
  let release!: () => void;
  const first = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/chat/queue/*/steer", async (route) => {
    await first;
    await route.continue();
  });
  await page
    .locator('.composer input[type="file"]')
    .setInputFiles({
      name: "引导资料.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("details"),
    });
  const input = page.locator(".composer > .t-textarea textarea");
  await input.fill("参考这份资料");
  await input.press("Meta+Enter");
  await expect(page.locator(".steering-queue-row")).toContainText(
    "引导资料.txt",
  );
  await page.getByRole("button", { name: "发送第 1 条引导" }).click();
  await input.fill("第二条要求");
  await input.press("Meta+Enter");
  await expect(input).toHaveValue("");
  await expect(page.locator(".steering-queue-row")).toHaveCount(2);
  release();
  await expect(page.locator(".steering-queue-row")).toHaveCount(1);
  await expect(page.locator(".steering-queue-row")).toContainText("第二条要求");
});
