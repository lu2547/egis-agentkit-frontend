import { expect, test } from "@playwright/test";

const connector = {
  resource_id: "mcp-generated",
  display_name: "报表系统",
  description: "查询销售月报和成本月报的月份、金额与币种。",
  owner_type: "system",
  owner_id: "system",
  is_available: true,
  is_usable: true,
  auth_type: "oauth",
  publication_revision: 1,
  payload: {
    config: {
      transport: "streamable_http",
      url: "https://localhost:38102/mcp",
      auth_type: "oauth",
    },
  },
};

test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
});

test("group creation only asks for a name and reads the generated ID when editing", async ({ page }) => {
  const group = { group_id: "generated-id", group_name: "研发组", is_enabled: true, member_count: 0 };
  let created = false;
  await page.route(/\/manager\/admin\/groups(?:\?|$)/, (route) => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON()).toEqual({ group_name: "研发组", is_enabled: true });
      created = true;
      return route.fulfill({ status: 201, json: group });
    }
    return route.fulfill({
      json: { items: created ? [group] : [], page: 1, page_size: 20, has_next: false },
    });
  });
  await page.goto("/admin/groups");
  await page.getByRole("button", { name: "创建用户组", exact: true }).click();
  const creation = page.getByRole("dialog", { name: "创建用户组", exact: true });
  await expect(creation.getByLabel("组 ID", { exact: true })).toHaveCount(0);
  await creation.getByLabel("组名称", { exact: true }).fill("研发组");
  await creation.getByRole("button", { name: "保存用户组" }).click();
  await expect(page.getByRole("cell", { name: "generated-id" })).toBeVisible();
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "编辑用户组" })
    .getByLabel("组 ID", { exact: true })).toHaveAttribute("readonly", "");
});

test("grant recipient search separates users and groups and pages remote matches", async ({ page }) => {
  const requests: URLSearchParams[] = [];
  const resource = {
    resource_type: "agent",
    resource_id: "assistant",
    resource_view_type: "system",
    resource_owner_type: "system",
    resource_owner_id: "company",
  };
  await page.route("**/manager/admin/grant-resources", (route) => route.fulfill({
    json: { items: [{ ...resource, display_name: "Skills 助手" }] },
  }));
  await page.route(/\/manager\/share-recipients(?:\?|$)/, (route) => {
    const params = new URL(route.request().url()).searchParams;
    requests.push(params);
    const page = Number(params.get("page"));
    const group = params.get("principal_type") === "group";
    const items = group
      ? [{ principal_type: "group", principal_id: `research-${page}`, display_name: `研究组 ${page}` }]
      : [{ principal_type: "user", principal_id: "analyst", display_name: "分析师" }];
    return route.fulfill({ json: { items, page, page_size: 1, has_next: group && page === 1 } });
  });
  let saved: unknown;
  await page.route(/\/manager\/admin\/grants(?:\?|$)/, (route) => {
    if (route.request().method() === "POST") {
      saved = route.request().postDataJSON();
      return route.fulfill({ json: {} });
    }
    return route.fulfill({ json: { items: [], page: 1, page_size: 20, has_next: false } });
  });
  await page.goto("/admin/grants");
  await page.getByRole("button", { name: "授予使用权限", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "授予使用权限", exact: true });
  await dialog.getByLabel("资源", { exact: true }).click();
  await page.getByText("Skills 助手 · agent", { exact: true }).click();
  const recipient = dialog.getByLabel("授权对象", { exact: true });
  await recipient.click();
  await page.getByText("分析师 · analyst", { exact: true }).click();
  await expect(dialog.getByRole("button", { name: "授予使用权限", exact: true })).toBeEnabled();
  await dialog.getByText("用户组", { exact: true }).click();
  await expect(dialog.getByRole("button", { name: "授予使用权限", exact: true })).toBeDisabled();
  await recipient.click();
  await recipient.fill("研究");
  await expect.poll(() => requests.some((params) =>
    params.get("principal_type") === "group" && params.get("q") === "研究")).toBe(true);
  await expect(page.getByText("分析师 · analyst", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await page.getByText("研究组 2 · research-2", { exact: true }).click();
  await dialog.getByRole("button", { name: "授予使用权限", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(saved).toEqual({ ...resource, principal_type: "group", principal_id: "research-2" });
});

test("administration uses a selected left navigation and a separate content pane", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() =>
    localStorage.setItem("pension-gpt-theme", "dark"),
  );
  await page.route(/\/manager\/admin\/resources\/mcp(?:\?|$)/, (route) =>
    route.fulfill({
      json: { items: [connector], page: 1, page_size: 20, has_next: false },
    }),
  );
  await page.goto("/admin/connectors");
  const navigation = page.getByRole("navigation", { name: "管理功能" });
  const content = page.getByRole("region", { name: "管理内容" });
  await expect(
    navigation.getByRole("link", { name: "MCP", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    content.getByRole("heading", { name: "MCP", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("管理企业成员、资源使用权限与共享发布。", { exact: true }),
  ).toHaveCount(0);
  const navBounds = await navigation.boundingBox();
  const contentBounds = await content.boundingBox();
  expect(navBounds!.x + navBounds!.width).toBeLessThanOrEqual(contentBounds!.x);
  await expect(
    content.getByRole("article", { name: "报表系统" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("admin-mcp.png"),
    animations: "disabled",
  });
  await page.evaluate(() => {
    document.addEventListener("animationstart", (event) => {
      const pane = event.target;
      if (
        event.animationName === "surface-arrive" &&
        pane instanceof HTMLElement &&
        pane.classList.contains("admin-content-inner")
      ) {
        pane.dataset.entered = "true";
      }
    });
  });
  await navigation.getByRole("link", { name: "用户组", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/groups$/);
  await expect(
    navigation.getByRole("link", { name: "用户组", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    content.getByRole("button", { name: "创建用户组" }),
  ).toBeVisible();
  await expect(content.locator(".admin-content-inner")).toHaveAttribute(
    "data-entered",
    "true",
  );

  await navigation.getByRole("link", { name: "用户", exact: true }).click();
  await expect(
    content.getByRole("heading", { name: "用户", exact: true }),
  ).toBeVisible();
  await expect(content.locator(".admin-content-inner")).toHaveCSS(
    "animation-name",
    "surface-arrive",
  );
});

test("new MCP configuration generates its ID and explains optional OAuth values", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() =>
    localStorage.setItem("pension-gpt-theme", "dark"),
  );
  let saved: Record<string, unknown> | undefined;
  await page.route(/\/manager\/admin\/resources\/mcp(?:\?|$)/, (route) => {
    if (route.request().method() === "POST") {
      saved = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: connector });
    }
    return route.fulfill({
      json: { items: [], page: 1, page_size: 20, has_next: false },
    });
  });
  await page.goto("/admin/connectors");
  await page.getByRole("button", { name: "新增连接器" }).click();
  const dialog = page.getByRole("dialog", { name: "添加连接器", exact: true });
  await expect(dialog.getByRole("textbox", { name: "连接器 ID" })).toHaveCount(
    0,
  );
  await expect(dialog.getByLabel("连接方式", { exact: true })).toBeVisible();
  await expect(dialog.getByText(/留空.*自动注册/)).toBeVisible();
  await expect(dialog.getByText(/多个权限.*空格/)).toBeVisible();
  await expect(dialog.getByText(/mcp:tools/)).toBeVisible();
  await dialog
    .getByRole("textbox", { name: "名称", exact: true })
    .fill("报表系统");
  await dialog
    .getByRole("textbox", { name: "服务地址", exact: true })
    .fill("https://localhost:38102/mcp");
  await page.screenshot({
    path: testInfo.outputPath("connector-create.png"),
    animations: "disabled",
  });
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(saved).toEqual({
    display_name: "报表系统",
    description: "",
    config: {
      transport: "streamable_http",
      url: "https://localhost:38102/mcp",
      auth_type: "oauth",
    },
  });
});

test("MCP editing keeps the server identity and validates the OAuth service URL", async ({
  page,
}) => {
  let saved: Record<string, unknown> | undefined;
  await page.route(/\/manager\/admin\/resources\/mcp(?:\?|$)/, (route) => {
    if (route.request().method() === "POST") {
      saved = route.request().postDataJSON();
      return route.fulfill({ json: connector });
    }
    return route.fulfill({
      json: { items: [connector], page: 1, page_size: 20, has_next: false },
    });
  });
  await page.goto("/admin/connectors");
  await page
    .getByRole("article", { name: "报表系统", exact: true })
    .getByRole("button", { name: "编辑", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "编辑连接器", exact: true });
  await dialog
    .getByRole("textbox", { name: "服务地址", exact: true })
    .fill("`https://localhost:38102/mcp`");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("HTTPS");
  expect(saved).toBeUndefined();
  await dialog
    .getByRole("textbox", { name: "服务地址", exact: true })
    .fill("https://localhost:38102/mcp");
  await dialog.getByLabel("OAuth 权限范围", { exact: true }).fill("mcp:tools");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(saved).toMatchObject({
    resource_id: "mcp-generated",
    config: { oauth_scope: "mcp:tools" },
  });
});

test("administration stays navigable on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 640 });
  await page.goto("/admin/connectors");
  await page.getByRole("button", { name: "新增连接器" }).click();
  const dialog = page.getByRole("dialog", { name: "添加连接器" });
  await expect(
    dialog.getByRole("button", { name: "保存", exact: true }),
  ).toBeInViewport();
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  const navigation = page.getByRole("navigation", { name: "管理功能" });
  await navigation.getByRole("link", { name: "使用授权", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/grants$/);
  await expect(
    page.getByRole("button", { name: "授予使用权限", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("skill resources use a bordered table that scrolls within the management pane", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 420, height: 720 });
  await page.route(/\/manager\/admin\/resources\/skill(?:\?|$)/, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            resource_id: "reports",
            resource_version: "1.0",
            display_name: "报表技能",
            owner_type: "system",
            owner_id: "system",
            is_available: true,
            bound_agents: [],
            grant_sources: [],
          },
        ],
        page: 1,
        page_size: 20,
        has_next: false,
      },
    }),
  );
  await page.goto("/admin/skills");
  const frame = page.getByRole("region", { name: "技能表格", exact: true });
  await expect(frame.getByRole("table")).toContainText("报表技能");
  await expect(frame).toHaveCSS("border-top-width", "1px");
  expect(
    await frame.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(420);
  await page.screenshot({
    path: testInfo.outputPath("admin-skills-narrow.png"),
  });
});

test("skill import approval clears selections when paging and recovers an emptied last page", async ({
  page,
}) => {
  const jobs = Array.from({ length: 21 }, (_, index) => ({
    job_id: `job-${index + 1}`,
    filename: `job-${index + 1}.zip`,
    owner_type: "system",
    uploader_type: "virtual",
    uploaded_by: "skill-system.integration",
    resource_version: "1.0.0",
    status: "pending_approval",
    result: { display_name: `导入技能 ${index + 1}` },
  }));
  await page.route(/\/manager\/admin\/skill-imports(?:\?|$)/, (route) => {
    const query = new URL(route.request().url()).searchParams;
    const page = Number(query.get("page") || "1");
    const pageSize = Number(query.get("page_size") || "20");
    return route.fulfill({
      json: {
        items: jobs.slice((page - 1) * pageSize, page * pageSize),
        page,
        page_size: pageSize,
        has_next: page * pageSize < jobs.length,
      },
    });
  });
  await page.route("**/manager/admin/skill-imports/batch/decision", (route) => {
    const { job_ids } = route.request().postDataJSON();
    expect(job_ids).toEqual(["job-21"]);
    jobs.pop();
    return route.fulfill({ json: { items: [{ id: "job-21", ok: true }] } });
  });

  await page.goto("/admin/skills");
  const reviews = page.getByRole("region", { name: "系统技能导入审核" });
  const pagination = reviews.getByRole("navigation", {
    name: "系统技能导入审核分页",
  });
  await reviews
    .getByRole("checkbox", { name: "导入技能 1", exact: true })
    .check();
  await pagination.getByRole("button", { name: "下一页" }).click();
  await expect(pagination).toContainText("第 2 页");
  await expect(reviews.getByRole("button", { name: "通过所选" })).toBeHidden();
  await reviews.getByRole("checkbox", { name: /导入技能 21/ }).check();
  await reviews.getByRole("button", { name: "通过所选" }).click();
  await expect(reviews.getByText("已通过 1 项，等待后台发布。")).toBeVisible();
  await expect(pagination).toContainText("第 1 页");
  await expect(
    pagination.getByRole("button", { name: "下一页" }),
  ).toBeDisabled();
  await expect(
    reviews.getByRole("checkbox", { name: "导入技能 1", exact: true }),
  ).not.toBeChecked();
});

test("group members are loaded on demand and paginate within the selected group", async ({
  page,
}) => {
  await page.route(/\/manager\/admin\/groups(?:\?|$)/, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            group_id: "research",
            group_name: "研究组",
            is_enabled: true,
            member_count: 21,
          },
        ],
        page: 1,
        page_size: 20,
        has_next: false,
      },
    }),
  );
  const requests: string[] = [];
  await page.route(/\/manager\/admin\/users(?:\?|$)/, (route) => {
    const query = new URL(route.request().url()).searchParams;
    requests.push(query.get("group_id") || "");
    const page = Number(query.get("page"));
    const items =
      page === 1
        ? Array.from({ length: 20 }, (_, index) => ({
            user_id: `research-${index + 1}`,
            username: `研究员 ${index + 1}`,
            role_type: "user",
            group_ids: ["research"],
            is_enabled: true,
          }))
        : [
            {
              user_id: "research-21",
              username: "研究员 21",
              role_type: "user",
              group_ids: ["research"],
              is_enabled: true,
            },
          ];
    return route.fulfill({
      json: { items, page, page_size: 20, has_next: page === 1 },
    });
  });

  await page.goto("/admin/groups");
  const members = page.getByRole("button", { name: "查看成员（21） · 研究组" });
  await expect(members).toBeVisible();
  expect(requests).toEqual([]);
  await members.click();
  const dialog = page.getByRole("dialog", { name: "研究组成员" });
  await expect(
    dialog.getByRole("cell", { name: "研究员 1", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "下一页" }).click();
  await expect(
    dialog.getByRole("cell", { name: "研究员 21", exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "下一页" })).toBeDisabled();
  expect(requests).toEqual(["research", "research"]);
});
