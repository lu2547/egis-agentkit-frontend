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
  await page.route(
    "**/manager/agents/expert-0?view=system",
    async (route) => {
      const expert = await (await route.fetch()).json();
      await route.fulfill({
        json: {
          ...expert,
          payload: {
            ...expert.payload,
            description: "从资料中提炼结论和行动建议。",
            bindings: ["skill", "mcp", "tool"].map((resourceType) => ({
              resource_type: resourceType,
              resource_id: `hidden-${resourceType}`,
              resource_version: "1.0.0",
            })),
          },
        },
      });
    },
  );
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
  const expertDetail = page.getByRole("dialog", { name: "研究分析专家" });
  await expect(
    expertDetail.getByText("从资料中提炼结论和行动建议。"),
  ).toBeVisible();
  await expect(expertDetail.getByText(/hidden-(skill|mcp|tool)/)).toHaveCount(0);
  await expect(expertDetail.getByText("v1.0", { exact: true })).toBeVisible();
  await expect(
    expertDetail.getByLabel("发布版本", { exact: true }),
  ).toHaveCount(0);
  await expect(
    expertDetail.getByRole("heading", { name: "专家帮你做" }),
  ).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/expert-detail.png" });
  await expertDetail.getByRole("button", { name: "召唤", exact: true }).click();
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

test("only administrators see Management under More", async ({
  page,
  request,
}) => {
  await page.route("**/manager/admin/users", (route) =>
    route.fulfill({
      json: {
        items: [
          { user_id: "admin", username: "Alice", role_type: "admin", is_enabled: true },
          { user_id: "user", username: "Bob", role_type: "user", is_enabled: true },
        ],
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "更多", exact: true }).click();
  await page.getByRole("button", { name: "管理", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.getByRole("cell", { name: "管理员用户", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "普通用户", exact: true })).toBeVisible();

  await request.post("http://127.0.0.1:38194/auth/login", {
    data: { user_id: "user", password: "test" },
  });
  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: "此页面仅管理员可访问" })).toBeVisible();
  await page.getByRole("button", { name: "更多", exact: true }).click();
  await expect(page.getByRole("button", { name: "共享申请", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "管理", exact: true })).toHaveCount(0);
});

test("management registers a remote expert with a credential reference", async ({ page }) => {
  await page.route("**/manager/agents", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({ status: 201, json: { id: "remote-finance" } });
  });
  await page.goto("/admin/remote-agents");
  await page.getByRole("link", { name: "登记第三方专家" }).click();
  await page.getByPlaceholder("例如 research_expert").fill("remote_finance");
  await page.getByPlaceholder("例如 研究专家").fill("财务专家");
  await page.getByPlaceholder("https://expert.example/v1/runs").fill("https://finance.example/v1/runs");
  await page.getByPlaceholder("EGIS_REMOTE_AGENT_FINANCE_TOKEN").fill("EGIS_REMOTE_AGENT_FINANCE_TOKEN");
  const submitted = page.waitForRequest((request) =>
    request.method() === "POST" && request.url().endsWith("/manager/agents"),
  );
  await page.getByRole("button", { name: "保存专家", exact: true }).click();
  const body = (await submitted).postDataJSON();
  expect(body.agent_type).toBe("remote");
  expect(body.payload).toMatchObject({
    remote_config: {
      transport: "http_sync",
      endpoint: "https://finance.example/v1/runs",
      credential_ref: "EGIS_REMOTE_AGENT_FINANCE_TOKEN",
    },
  });
  await expect(page).toHaveURL(/\/admin\/remote-agents$/);
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
  await page.getByRole("button", { name: "保存专家团", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("请填写有效的主理人英文名称");
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
    "/experts?tab=personal",
    "/share-requests",
    "/admin/users",
    "/admin/groups",
    "/admin/grants",
    "/admin/share-reviews",
    "/admin/remote-agents",
  ]) {
    await page.goto(path);
    await expect(
      page.locator(".page h1, .catalog-header").first(),
    ).toBeVisible();
    await expect(page.locator(".empty .t-loading:visible")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("skill upload uses an asynchronous import with category and avatar", async ({
  page,
}) => {
  await page.goto("/skills");
  await page.getByRole("button", { name: "添加技能", exact: true }).click();
  await page.getByRole("menuitem", { name: "上传技能", exact: true }).click();
  await expect(page).toHaveURL("/skills/upload");
  await expect(page.getByRole("textbox", { name: "技能版本" })).toHaveCount(0);
  await page.getByLabel("选择技能文件").setInputFiles({
    name: "skill.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("test-only-package"),
  });
  const uploaded = page.waitForRequest(
    (request) =>
      request.url().includes("/manager/skills/imports") &&
      request.method() === "POST",
  );
  await page.getByRole("button", { name: "提交导入", exact: true }).click();
  const request = await uploaded;
  expect(new URL(request.url()).searchParams.has("version")).toBe(false);
  const job = await (await request.response())!.json();
  expect(job.category).toBe("办公协同");
  expect(job.avatar).toBe("skill:deep-thinking");
  expect(job).not.toHaveProperty("version");
  await expect(
    page.getByRole("region", { name: "技能导入任务" }),
  ).toContainText("skill.zip");
});

test("site icon loads without a missing-resource error", async ({ page }) => {
  await page.goto("/");
  const icon = await page.locator('link[rel="icon"]').getAttribute("href");
  expect(icon).toBeTruthy();
  expect((await page.request.get(new URL(icon!, page.url()).href)).ok()).toBe(
    true,
  );
});

test("initial skill sharing sends a stable resource and organization group", async ({
  page,
}) => {
  await page.goto("/skills");
  await page.getByRole("button", { name: "查看报告写作", exact: true }).click();
  const request = page.waitForRequest(
    (r) => r.url().endsWith("/manager/share-requests") && r.method() === "POST",
  );
  await page.getByRole("button", { name: "申请共享" }).click();
  const dialog = page.getByRole("dialog", { name: "申请共享" });
  const submit = dialog.getByRole("button", { name: "提交共享申请" });
  await expect(submit).toBeDisabled();
  await dialog.getByPlaceholder("选择用户或组织组").click();
  await page.getByText("研究部（组织组 · research）", { exact: true }).click();
  await submit.click();
  expect((await request).postDataJSON()).toEqual({
    resource_type: "skill",
    resource_id: "writing",
    target: { principal_type: "group", principal_id: "research" },
  });
});

test("management grants current access by stable resource and recipient", async ({ page }) => {
  const resource = {
    resource_type: "mcp",
    resource_id: "report-connector",
    resource_version: "2",
    resource_view_type: "system",
    resource_owner_type: "system",
    resource_owner_id: "platform",
  };
  let grants: Record<string, unknown>[] = [];
  await page.route("**/manager/admin/grant-resources", (route) =>
    route.fulfill({ json: { items: [{ ...resource, version_label: "1.1", display_name: "报表连接器" }] } }),
  );
  await page.route("**/manager/admin/grants", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { items: grants } });
    grants = [{
      ...route.request().postDataJSON(),
      id: "direct-grant-2", grant_source_type: "manual", granted_by: "admin",
    }];
    return route.fulfill({ json: grants[0] });
  });
  await page.goto("/admin/grants");
  await page.getByRole("button", { name: "授予使用权限", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "授予使用权限" });
  const submit = dialog.getByRole("button", { name: "授予使用权限", exact: true });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel("资源", { exact: true }).click();
  await page.getByText("报表连接器 · mcp", { exact: true }).click();
  await dialog.getByLabel("授权对象").click();
  await page.getByText("分析师（用户 · analyst）", { exact: true }).click();
  const sent = page.waitForRequest((request) =>
    request.url().endsWith("/manager/admin/grants") && request.method() === "POST",
  );
  await submit.click();
  expect((await sent).postDataJSON()).toEqual({
    resource_type: "mcp", resource_id: "report-connector", resource_view_type: "system",
    resource_owner_type: "system", resource_owner_id: "platform",
    principal_type: "user", principal_id: "analyst",
  });
  await expect(page.getByRole("columnheader", { name: "版本", exact: true })).toHaveCount(0);
  const row = page.getByRole("row").filter({ hasText: "报表连接器" });
  await expect(row).toContainText("连接器广场 · 管理员直接授权");
  await expect(row).toContainText("分析师");
  await expect(row).toContainText("用户 · analyst");
});

test("sharing an expert update keeps the current audience without a version picker", async ({ page }) => {
  const historyRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/manager/agents/expert-2/versions")) historyRequests.push(request.url());
  });
  await page.goto("/experts");
  await page.getByRole("button", { name: "查看写作与表达专家" }).click();
  const detail = page.getByRole("dialog", { name: "写作与表达专家" });
  await expect(detail.getByText("v1.2", { exact: true })).toBeVisible();
  await expect(detail.getByRole("group", { name: "发布版本" })).toHaveCount(0);
  await detail.getByRole("button", { name: "共享新版本", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "共享新版本" });
  await expect(dialog).toContainText("现有受众将使用新版本");
  await expect(dialog.getByPlaceholder("选择用户或组织组")).toHaveCount(0);
  const sent = page.waitForRequest((request) =>
    request.url().endsWith("/manager/share-requests") && request.method() === "POST",
  );
  await dialog.getByRole("button", { name: "提交共享申请" }).click();
  expect((await sent).postDataJSON()).toEqual({ resource_type: "agent", resource_id: "expert-2" });
  await expect(page.getByText("共享申请已提交。")).toBeVisible();
  expect(historyRequests).toEqual([]);
});

test("summoning an expert uses the current displayed edition", async ({ page }) => {
  await page.goto("/experts");
  await page.getByRole("button", { name: "查看写作与表达专家" }).click();
  const detail = page.getByRole("dialog", { name: "写作与表达专家" });
  await expect(detail.getByText("v1.2", { exact: true })).toBeVisible();
  await detail.getByRole("button", { name: "召唤", exact: true }).click();
  await expect(page.getByText("正在与 写作与表达专家 一起工作")).toBeVisible();
  await page.getByPlaceholder("今天帮你做些什么？@ 添加上下文，/调用技能与指令。")
    .fill("起草报告");
  const sent = page.waitForRequest((request) =>
    request.url().endsWith("/manager/tasks") && request.method() === "POST",
  );
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  expect((await sent).postDataJSON()).toMatchObject({
    definition_id: "expert-2", resource_view_type: "private", resource_version: "3",
  });
});

test("admin review presents the submitted edition and existing audience", async ({ page }) => {
  const review = {
    review_id: "upgrade-review",
    review_type: "update",
    resource_type: "agent",
    resource_id: "expert-2",
    resource_version: "3",
    version_label: "1.2",
    share_scope_type: null,
    principal_id: null,
    review_status_type: "pending",
    review_reason: "",
  };
  await page.route("**/manager/admin/share-reviews", (route) =>
    route.fulfill({ json: { items: [review] } }),
  );
  await page.route("**/manager/admin/share-reviews/upgrade-review/decision", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ is_approved: true, reason: "" });
    review.review_status_type = "approved";
    await route.fulfill({ json: review });
  });
  await page.goto("/admin/share-reviews");
  await page.getByRole("button", { name: "审核版本" }).click();
  const dialog = page.getByRole("dialog", { name: "共享申请详情" });
  await expect(dialog).toContainText("发布版本 1.2");
  await expect(dialog).toContainText("现有共享受众");
  await dialog.getByRole("button", { name: "通过共享申请" }).click();
  await expect(page.getByText("已通过", { exact: true })).toBeVisible();
});
