import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() => {
    if (window === window.top)
      sessionStorage.setItem("egis_access_token", "test-only");
  });
});
test("catalog detail, summon, native stream and isolated artifact preview", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "今天，想一起完成什么？" }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/home-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "专家·技能·连接器", exact: true })
    .click();
  await expect(
    page.getByRole("navigation", { name: "能力目录" }),
  ).toBeVisible();
  await expect(page.locator(".catalog-card")).toHaveCount(6);
  await page.screenshot({
    path: "docs/screenshots/experts-desktop.png",
    fullPage: true,
  });
  await page.locator(".catalog-card").first().click();
  await expect(
    page.getByRole("heading", { name: "研究分析专家", exact: true, level: 2 }),
  ).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/expert-detail.png" });
  await page
    .getByRole("dialog", { name: "研究分析专家" })
    .getByRole("button", { name: "召唤", exact: true })
    .click();
  await page
    .getByPlaceholder("今天帮你做些什么？@ 添加上下文，/调用技能与指令。")
    .fill("整理行业研究与行动建议");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "已完成研究简报" }),
  ).toBeVisible();
  await expect(page.locator(".user-message")).toHaveCount(1);
  await expect(page.locator(".assistant-message")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /处理时长/ })).toBeVisible();
  await page.getByRole("button", { name: /处理时长/ }).click();
  await expect(page.getByText("正在整理资料")).toBeVisible();
  await expect(page.getByText(/internal timestamp/)).toHaveCount(0);
  await page.locator(".artifact-card").first().click();
  await expect(page.locator('iframe[title="隔离的 HTML 预览"]')).toBeVisible();
  await expect(page.locator("iframe")).toHaveAttribute("sandbox", "");
  expect(
    await page.evaluate(() => Boolean((window as any).previewScriptRan)),
  ).toBe(false);
  await page.screenshot({
    path: "docs/screenshots/chat-workspace-desktop.png",
  });
  expect(errors).toEqual([]);
});
test("confirmation resumes one reply and stop waits for native termination", async ({
  page,
}) => {
  await page.goto("/tasks/s1");
  const input = page.getByPlaceholder(
    "今天帮你做些什么？@ 添加上下文，/调用技能与指令。",
  );
  await expect(
    page.getByRole("button", { name: "发送消息", exact: true }),
  ).toBeDisabled();
  await input.fill("测试确认");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.getByText("需要你的确认")).toBeVisible();
  await page.getByRole("button", { name: "允许此次操作" }).click();
  await expect(
    page.getByRole("heading", { name: "已完成研究简报" }),
  ).toBeVisible();
  await expect(page.locator(".assistant-message")).toHaveCount(1);
  await input.fill("长任务");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await page.getByRole("button", { name: "停止生成" }).click();
  await expect(page.getByText("已停止生成")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "发送消息", exact: true }),
  ).toBeVisible();
});
test("narrow layout and real error states remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/experts");
  await expect(page.getByRole("button", { name: "展开侧边栏" })).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/experts-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "展开侧边栏" }).click();
  await page.getByRole("button", { name: "收起导航" }).click();
  await page.getByRole("button", { name: "技能", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "技能", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "停用报告写作", exact: true }).click();
  await expect(page.getByText("未获授权，启停失败")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "停用报告写作", exact: true }),
  ).toBeVisible();
});
test("markdown is sanitized and user cannot open admin content", async ({
  page,
  request,
}) => {
  await page.goto("/skills");
  await page.getByRole("button", { name: "查看报告写作", exact: true }).click();
  await expect(page.locator(".markdown")).toBeVisible();
  expect(await page.evaluate(() => Boolean((window as any).badMarkdown))).toBe(
    false,
  );
  await expect(
    page.locator(
      '.markdown script,.markdown [onerror],.markdown a[href^="javascript:"]',
    ),
  ).toHaveCount(0);
  await request.post("http://127.0.0.1:38194/auth/login", {
    data: { user_id: "user", password: "test" },
  });
  await page.goto("/admin/users");
  await expect(
    page.getByRole("heading", { name: "此页面仅管理员可访问" }),
  ).toBeVisible();
  await expect(page.locator(".admin-tabs")).toHaveCount(0);
});

test("team edit loads its editable orchestrator configuration", async ({
  page,
}) => {
  await page.goto("/teams/team-1/edit");
  await expect(page.getByPlaceholder("team_orchestrator")).toHaveValue(
    "research_leader",
  );
  await expect(page.getByPlaceholder("项目主理人")).toHaveValue("研究主理人");
  await expect(
    page.getByPlaceholder("描述主理人如何分工、协调和汇总结果"),
  ).toHaveValue("先分配研究任务，再汇总结论。");
  await page.screenshot({
    path: "docs/screenshots/team-edit-desktop.png",
    fullPage: true,
  });
  await page.getByPlaceholder("team_orchestrator").fill("");
  await expect(
    page.getByRole("button", { name: "保存专家团", exact: true }),
  ).toBeDisabled();
});
test("all management pages and creation forms render without application errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const path of [
    "/experts/new",
    "/teams/new",
    "/connectors",
    "/settings/assistant",
    "/share-requests",
    "/admin/users",
    "/admin/groups",
    "/admin/grants",
    "/admin/share-reviews",
    "/admin/packages",
  ]) {
    await page.goto(path);
    await expect(
      page.locator(".page h1, .catalog-header").first(),
    ).toBeVisible();
    await expect(page.locator(".empty .t-loading:visible")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("skill upload sends an explicit immutable version", async ({ page }) => {
  await page.goto("/skills");
  await page.getByRole("button", { name: "添加技能", exact: true }).click();
  await page.getByRole("menuitem", { name: "上传技能", exact: true }).click();
  await page.getByLabel("技能版本").fill("2.0.0");
  await page.getByLabel("选择技能文件").setInputFiles({
    name: "skill.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("test-only-package"),
  });
  const uploaded = page.waitForRequest(
    (request) =>
      request.url().includes("/manager/skills/upload") &&
      request.method() === "POST",
  );
  await page.getByRole("button", { name: "上传", exact: true }).click();
  expect(new URL((await uploaded).url()).searchParams.get("version")).toBe(
    "2.0.0",
  );
});

test("site icon loads without a missing-resource error", async ({ page }) => {
  await page.goto("/");
  const icon = await page.locator('link[rel="icon"]').getAttribute("href");
  expect(icon).toBeTruthy();
  expect((await page.request.get(new URL(icon!, page.url()).href)).ok()).toBe(
    true,
  );
});

test("sharing a skill sends the selected resource version", async ({
  page,
}) => {
  await page.goto("/skills");
  await page.getByRole("button", { name: "查看报告写作", exact: true }).click();
  const request = page.waitForRequest(
    (r) => r.url().endsWith("/manager/share-requests") && r.method() === "POST",
  );
  await page.getByRole("button", { name: "申请共享" }).click();
  expect((await request).postDataJSON()).toEqual({
    resource_type: "skill",
    resource_id: "writing",
    resource_version: "1.0.0",
  });
});
