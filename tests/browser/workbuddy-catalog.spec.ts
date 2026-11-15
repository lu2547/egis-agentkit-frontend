import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
});

test("expert catalog includes definitions from later pages", async ({ page }) => {
  await page.route(/\/api\/manager\/agents(?:\?|$)/, async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set("limit", "3");
    const response = await route.fetch({ url: url.href });
    await route.fulfill({ response });
  });
  await page.goto("/experts");
  await expect(
    page.getByRole("button", { name: "查看研究分析专家" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "查看项目协作伙伴" }),
  ).toBeVisible();
});

test("Escape restores expert card focus without a pointer-open outline", async ({ page }) => {
  await page.goto("/experts");
  const opener = page.getByRole("button", { name: "查看研究分析专家" });
  const detail = page.getByRole("dialog", { name: "研究分析专家" });

  await opener.click();
  await expect(detail).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(detail).toBeHidden();
  await expect(opener).toBeFocused();
  await expect(opener).toHaveCSS("outline-style", "none");

  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(opener).toBeFocused();
  await expect(opener).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Enter");
  await expect(detail).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(detail).toBeHidden();
  await expect(opener).toBeFocused();
  await expect(opener).toHaveCSS("outline-style", "solid");
});

test("catalog navigation and filters use ownership and installation state", async ({
  page,
}) => {
  await page.route("**/api/manager/skills", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.items[0].is_installed = true;
    data.items[0].is_enabled = true;
    data.items[1].is_installed = false;
    data.items[1].is_enabled = false;
    await route.fulfill({ response, json: data });
  });
  await page.goto("/experts");
  const nav = page.getByRole("navigation", { name: "能力目录" });
  await expect(nav.getByRole("button")).toHaveText([
    "个人助理",
    "专家",
    "专家团",
    "技能",
    "连接器",
    "工具",
  ]);
  await expect(
    page.getByRole("button", { name: "添加专家", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "我的专家", exact: true }).click();
  await expect(page.getByTestId("catalog-card")).toHaveCount(1);
  await expect(page.getByTestId("catalog-card")).toContainText(
    "写作与表达专家",
  );
  await nav.getByRole("button", { name: "专家团" }).click();
  await expect(page.getByRole("button", { name: "我的专家团" })).toBeVisible();
  await expect(page.getByRole("button", { name: "添加专家团" })).toBeVisible();
  await nav.getByRole("button", { name: "技能" }).click();
  await page.getByRole("button", { name: "我安装的" }).click();
  await expect(page.getByTestId("catalog-card")).toHaveCount(1);
  await expect(page.getByTestId("catalog-card")).toContainText("研究方法");
  await page.getByRole("button", { name: "添加技能" }).click();
  await expect(page.getByRole("menuitem", { name: "上传技能" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "创建技能" })).toBeVisible();
  await nav.getByRole("button", { name: "连接器" }).click();
  await expect(page.getByRole("button", { name: "我安装的" })).toBeVisible();
  await expect(page.getByRole("button", { name: "添加连接器" })).toHaveCount(0);
});

test("expert creation explains what is missing at the save button", async ({ page }) => {
  let submitted: any;
  await page.route("**/api/manager/agents", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    submitted = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { id: "created" } });
  });
  await page.goto("/experts/new");
  await page.getByPlaceholder("说明专家的角色、工作方法与交付要求").fill("生成 Markdown");
  const save = page.getByRole("button", { name: "保存专家", exact: true });
  await save.click({ timeout: 2000 });
  await expect(page.getByRole("alert")).toContainText("请输入英文名称");
  expect(submitted).toBeUndefined();

  await page.getByPlaceholder("例如 research_expert").fill(" markdown_writer ");
  await save.click();
  await expect(page.getByRole("alert")).toContainText("请输入展示名称");
  await page.getByPlaceholder("例如 研究专家").fill("写作专家");
  await save.click();
  await expect.poll(() => submitted).toMatchObject({
    agent_name: "markdown_writer",
    agent_display_name: "写作专家",
    payload: { system_prompt: "生成 Markdown", bindings: [] },
  });
  await expect(page).toHaveURL(/\/experts$/);
});

test("expert editor reads its single definition and keeps its owner", async ({ page }) => {
  const listRequests: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET" && ["/api/manager/agents", "/api/manager/teams"].includes(path))
      listRequests.push(path);
  });
  await page.route("**/api/manager/agents/expert-0?view=system", (route) =>
    route.fulfill({
      json: {
        id: "expert-0",
        definition_type: "agent",
        agent_type: "expert",
        agent_name: "system_expert",
        agent_display_name: "系统专家",
        owner_type: "system",
        owner_id: "platform",
        resource_view_type: "system",
        owner_version: 4,
        version: 4,
        is_editable: true,
        payload: { description: "", category: "办公协同", tags: [], starter_prompts: [], bindings: [] },
      },
    }),
  );
  let submitted: unknown;
  await page.route("**/api/manager/agents/expert-0", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    submitted = route.request().postDataJSON();
    await route.fulfill({ json: { id: "expert-0" } });
  });
  await page.goto("/experts/expert-0/edit?view=system");
  await expect(page.getByPlaceholder("例如 研究专家")).toHaveValue("系统专家");
  const executionType = page.locator(".field").filter({ has: page.getByText("专家执行方式", { exact: true }) });
  await expect(executionType.locator("input").first()).toBeDisabled();
  expect(listRequests).toEqual([]);
  await page.getByRole("button", { name: "保存专家", exact: true }).click();
  await expect.poll(() => submitted).toMatchObject({
    owner_version: 4,
  });
  expect(submitted).not.toHaveProperty("agent_type");
  expect(submitted).not.toHaveProperty("owner_type");
  expect(submitted).not.toHaveProperty("owner_id");
});

test("team editor submits its current team revision after previous edits", async ({ page }) => {
  let submitted: any;
  await page.route("**/api/manager/teams/team-1", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    submitted = route.request().postDataJSON();
    await route.fulfill({ json: { id: "team-1" } });
  });
  await page.goto("/teams/team-1/edit?view=private");
  await expect(page.getByPlaceholder("例如 研究专家")).toHaveValue("研究与策略专家团");
  await page.getByRole("button", { name: "保存专家团", exact: true }).click();
  await expect.poll(() => submitted).toMatchObject({
    config_version: 2,
    owner_type: "user",
    owner_id: "demo",
  });
  expect(submitted).not.toHaveProperty("owner_version");
});

test("expert avatar saves a stable ID and appears when reopened", async ({
  page,
}) => {
  let saved: any;
  const created = () => ({
    id: "created",
    definition_type: "agent",
    agent_type: "expert",
    owner_type: "user",
    owner_id: "demo",
    resource_view_type: "private",
    is_usable: true,
    is_editable: true,
    is_deletable: true,
    owner_version: 1,
    version: 1,
    ...saved,
  });
  await page.route("**/api/manager/agents/created?view=private", (route) =>
    route.fulfill({ json: created() }),
  );
  await page.route("**/api/manager/agents", async (route) => {
    if (route.request().method() === "POST") {
      saved = route.request().postDataJSON();
      await route.fulfill({ json: { id: "created", ...saved } });
      return;
    }
    const response = await route.fetch();
    const data = await response.json();
    if (saved) data.items.push(created());
    await route.fulfill({ response, json: data });
  });
  await page.goto("/experts/new");
  await page.locator("#definition-name input").fill("my_expert");
  await page.locator("#definition-display-name input").fill("测试专家");
  await page
    .getByRole("group", { name: "选择头像" })
    .getByRole("button", { name: "developer", exact: true })
    .click();
  await page.getByRole("button", { name: "保存专家" }).click();
  await expect.poll(() => saved?.payload?.avatar).toBe("expert:developer");
  await page.getByRole("button", { name: "查看测试专家" }).click();
  await expect(page.getByRole("dialog").locator("img")).toHaveAttribute(
    "src",
    "/catalog/experts/developer.webp",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "编辑", exact: true })
    .click();
  await expect(
    page
      .getByRole("group", { name: "选择头像" })
      .getByRole("button", { name: "developer", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

for (const theme of ["light", "dark"]) {
  test(`personal preferences and detail dialog remain usable in ${theme}`, async ({
    page,
  }) => {
    await page.addInitScript(
      (value) => localStorage.setItem("pension-gpt-theme", value),
      theme,
    );
    await page.setViewportSize({ width: 900, height: 560 });
    await page.goto("/experts?tab=personal");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page.getByRole("tab", { name: /user.md.*业务背景/ }).click();
    await expect(page.getByRole("button", { name: "保存设置" })).toBeVisible();
    await page
      .getByRole("navigation", { name: "能力目录" })
      .getByRole("button", { name: "专家", exact: true })
      .click();
    await page.getByRole("button", { name: "查看研究分析专家" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "关闭详情" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}

test("skill avatar saves and reopens from the resource payload", async ({
  page,
}) => {
  await page.goto("/skills");
  await page.getByRole("button", { name: "添加技能" }).click();
  await page.getByRole("menuitem", { name: "创建技能" }).click();
  await page.getByRole("textbox", { name: "技能 ID" }).fill("new_skill");
  await page
    .getByRole("textbox", { name: "SKILL.md 文档" })
    .fill(
      "---\nname: 测试技能\ndescription: 测试说明\nversion: 1.0.0\n---\n技能说明",
    );
  await page
    .getByRole("group", { name: "选择头像" })
    .getByRole("button", { name: "ppt", exact: true })
    .click();
  const saving = page.waitForRequest(
    (request) =>
      request.url().endsWith("/manager/skills") && request.method() === "POST",
  );
  await page.getByRole("button", { name: "发布版本" }).click();
  expect((await saving).postDataJSON().avatar).toBe("skill:ppt");
  const card = page.getByTestId("catalog-card").filter({ hasText: "测试技能" });
  await expect(card.locator("img")).toHaveAttribute(
    "src",
    "/catalog/skills/ppt.webp",
  );
  await card.getByRole("button", { name: "编辑" }).click();
  await expect(
    page
      .getByRole("group", { name: "选择头像" })
      .getByRole("button", { name: "ppt", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
