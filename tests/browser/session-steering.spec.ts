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

test("supports several queued steers with edit, reorder, delete and batch delivery", async ({
  page,
  request,
}) => {
  const input = page.locator(".composer > .t-textarea textarea");
  for (const text of ["先看预算", "颜色用蓝色", "保留原始文件"]) {
    await input.fill(text);
    await page.getByRole("button", { name: "加入引导队列" }).click();
  }
  await expect(page.locator(".steering-queue-row")).toHaveCount(3);
  await page.getByRole("button", { name: "编辑第 2 条引导" }).click();
  await page.getByLabel("第 2 条引导内容").fill("颜色改为橙色");
  await page.getByLabel("第 2 条引导内容").press("Enter");
  await page
    .getByRole("button", { name: "移动第 3 条引导" })
    .press("Alt+ArrowUp");
  await page.getByRole("button", { name: "删除第 1 条引导" }).click();
  const sent = page.waitForRequest(
    (r) => r.url().endsWith("/chat/") && r.postDataJSON()?.delivery === "steer",
  );
  await page.getByRole("button", { name: "全部引导", exact: true }).click();
  const body = (await sent).postDataJSON();
  expect(body.input.map((m: any) => m.content[0].text)).toEqual([
    "保留原始文件",
    "颜色改为橙色",
  ]);
  await expect(page.locator(".steering-queue-row")).toHaveCount(0);
  await expect(page.locator(".assistant-message")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "停止生成", exact: true }),
  ).toBeVisible();
  await request.post("http://127.0.0.1:38194/__test/events", {
    data: {
      session_id: "s1",
      events: [
        {
          type: "HINT_BLOCK",
          block_id: body.input[0].id,
          source: "user_steering",
          hint: "保留原始文件",
        },
      ],
    },
  });
  await expect(
    page.locator(".user-message").filter({ hasText: "保留原始文件" }),
  ).toContainText("已接收");
});

test("failed steering keeps its row and retries the same message ID", async ({
  page,
}) => {
  const ids: string[] = [];
  await page.route("**/api/chat/", async (route) => {
    const body = route.request().postDataJSON();
    if (body.delivery !== "steer") return route.continue();
    ids.push(body.input[0].id);
    if (ids.length === 1)
      return route.fulfill({ status: 503, json: { detail: "暂时不可用" } });
    return route.continue();
  });
  const input = page.locator(".composer > .t-textarea textarea");
  await input.fill("先确认预算");
  await page.getByRole("button", { name: "加入引导队列" }).click();
  await page.getByRole("button", { name: "发送第 1 条引导" }).click();
  await expect(page.locator(".steering-queue-row")).toContainText("重试");
  await page.getByRole("button", { name: "发送第 1 条引导" }).click();
  await expect(page.locator(".steering-queue-row")).toHaveCount(0);
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
});

for (const [platform, shortcut] of [
  ["MacIntel", "Meta+Enter"],
  ["Win32", "Alt+Enter"],
]) {
  test(`queues steering with ${shortcut} on ${platform} until explicitly sent`, async ({
    page,
    request,
  }) => {
    await page.addInitScript(
      (value) =>
        Object.defineProperty(navigator, "platform", { get: () => value }),
      platform,
    );
    await page.reload();
    await page
      .locator(".composer > .t-textarea textarea")
      .fill("长任务：继续执行");
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "停止生成", exact: true }),
    ).toBeVisible();
    const input = page.locator(".composer > .t-textarea textarea");
    await input.fill("补充要求");
    await input.press("Enter");
    await expect(input).toHaveValue("补充要求\n");
    await expect(page.locator(".steering-queue-row")).toHaveCount(0);
    const submitted: unknown[] = [];
    page.on("request", (request) => {
      if (
        request.url().endsWith("/chat/") &&
        request.postDataJSON()?.delivery === "steer"
      )
        submitted.push(request.postDataJSON());
    });
    await input.press(shortcut!);
    await expect(page.locator(".steering-queue-row")).toHaveCount(1);
    await expect(input).toHaveValue("");
    expect(submitted).toHaveLength(0);
    const sent = page.waitForRequest(
      (request) =>
        request.url().endsWith("/chat/") &&
        request.postDataJSON()?.delivery === "steer",
    );
    await page.getByRole("button", { name: "发送第 1 条引导" }).click();
    expect((await sent).postDataJSON().input[0].content[0].text).toBe(
      "补充要求",
    );
    await expect(input).toHaveValue("");
    await expect(page.locator(".steering-queue-row")).toHaveCount(0);
    await request.post("http://127.0.0.1:38194/__test/events", {
      data: {
        session_id: "s1",
        events: [{ type: "REPLY_END", finished_reason: "completed" }],
      },
    });
    await expect(
      page.getByRole("button", { name: "发送消息", exact: true }),
    ).toBeVisible();
    const normal = page.waitForRequest(
      (request) =>
        request.url().endsWith("/chat/") && !request.postDataJSON()?.delivery,
    );
    await input.fill("下一条普通消息");
    await input.press(shortcut!);
    expect((await normal).postDataJSON().input.content[0].text).toBe(
      "下一条普通消息",
    );
  });
}

test("steering includes an attachment selected while work is running", async ({
  page,
}) => {
  await page.locator('.composer input[type="file"]').setInputFiles({
    name: "引导资料.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("supporting details"),
  });
  await expect(page.locator(".composer .attachments")).toContainText(
    "引导资料.txt",
  );
  await page.locator(".composer > .t-textarea textarea").fill("参考这份资料");
  await page.getByRole("button", { name: "加入引导队列" }).click();
  const submitted = page.waitForRequest(
    (r) => r.url().endsWith("/chat/") && r.postDataJSON()?.delivery === "steer",
  );
  await page.getByRole("button", { name: "发送第 1 条引导" }).click();
  expect((await submitted).postDataJSON().input[0].content[0].text).toContain(
    "引导资料.txt",
  );
  await expect(page.locator(".composer .attachments")).toHaveCount(0);
});

test("shortcut queues another draft while an explicit delivery is still pending", async ({
  page,
}) => {
  let release!: () => void;
  const first = new Promise<void>((resolve) => {
    release = resolve;
  });
  const sent: string[] = [];
  await page.route("**/api/chat/", async (route) => {
    const body = route.request().postDataJSON();
    if (body.delivery === "steer") {
      sent.push(body.input[0].content[0].text);
      if (sent.length === 1) await first;
    }
    await route.continue();
  });
  const input = page.locator(".composer > .t-textarea textarea");
  await input.fill("第一条待发引导");
  await input.press("Meta+Enter");
  await expect(page.locator(".steering-queue-row")).toHaveCount(1);
  expect(sent).toHaveLength(0);
  await page.getByRole("button", { name: "发送第 1 条引导" }).click();
  await expect.poll(() => sent.length).toBe(1);
  await input.fill("第二条待发引导");
  await input.press("Meta+Enter");
  await expect(input).toHaveValue("");
  await expect(page.locator(".steering-queue-row")).toHaveCount(2);
  expect(sent).toHaveLength(1);
  release();
  await expect(page.locator(".steering-queue-row")).toHaveCount(1);
  expect(sent).toHaveLength(1);
  await page.getByRole("button", { name: "发送第 1 条引导" }).click();
  await expect.poll(() => sent.length).toBe(2);
  await expect(page.locator(".steering-queue-row")).toHaveCount(0);
  expect(sent).toEqual(["第一条待发引导", "第二条待发引导"]);
});
