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

test("administration uses a selected left navigation and a separate content pane", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() =>
    localStorage.setItem("pension-gpt-theme", "dark"),
  );
  await page.route("**/manager/admin/resources/mcp", (route) =>
    route.fulfill({ json: { items: [connector] } }),
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
  await navigation.getByRole("link", { name: "用户组", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/groups$/);
  await expect(
    navigation.getByRole("link", { name: "用户组", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    content.getByRole("button", { name: "创建用户组" }),
  ).toBeVisible();
});

test("new MCP configuration generates its ID and explains optional OAuth values", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() =>
    localStorage.setItem("pension-gpt-theme", "dark"),
  );
  let saved: Record<string, unknown> | undefined;
  await page.route("**/manager/admin/resources/mcp", (route) => {
    if (route.request().method() === "POST") {
      saved = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: connector });
    }
    return route.fulfill({ json: { items: [] } });
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
  await page.route("**/manager/admin/resources/mcp", (route) => {
    if (route.request().method() === "POST") {
      saved = route.request().postDataJSON();
      return route.fulfill({ json: connector });
    }
    return route.fulfill({ json: { items: [connector] } });
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
