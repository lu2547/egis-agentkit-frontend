import { expect, test } from "@playwright/test";

const tool = {
  resource_id: "Read",
  resource_version: "1.0.0",
  owner_type: "system",
  owner_id: "system",
  display_name: "读取文件",
  description: "读取项目文件。",
  is_usable: true,
  is_editable: true,
  is_installed: false,
  is_enabled: false,
  is_available: true,
  payload: { exposure: "model", input_schema: { type: "object" } },
};

test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
});

test("canceling a skill selection keeps its marketplace card available for selecting again", async ({
  page,
}) => {
  let installed = true;
  await page.route(/\/manager\/skills\?/, (route) =>
    route.fulfill({
      json: {
        next_cursor: null,
        categories: ["办公协同"],
        items: [
          {
            ...tool,
            resource_type: "skill",
            resource_id: "report",
            display_name: "报告技能",
            is_installed: installed,
            is_enabled: installed,
            payload: { category: "办公协同" },
          },
        ],
      },
    }),
  );
  await page.route("**/manager/skills/report/installation", (route) => {
    expect(route.request().method()).toBe("DELETE");
    installed = false;
    return route.fulfill({ status: 204 });
  });
  await page.goto("/skills");
  await page.getByRole("button", { name: "报告技能的技能操作" }).click();
  await page.getByRole("menuitem", { name: "取消选用", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "安装报告技能", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "查看报告技能", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "取消选用", exact: true }),
  ).toHaveCount(0);
});

test("tools catalog displays public and expert tools with read-only details", async ({
  page,
}) => {
  const defaultTool = { ...tool, is_system_default: true };
  const report = {
    ...tool,
    resource_id: "Report",
    display_name: "报告生成",
    is_agent_tool: true,
    is_usable: false,
  };
  await page.route(/\/manager\/tools\?/, (route) => {
    const category = new URL(route.request().url()).searchParams.get("category");
    return route.fulfill({
      json: {
        items: category === "专家工具" ? [report] : [defaultTool, report],
        next_cursor: null,
        categories: ["系统默认", "专家工具"],
      },
    });
  });
  await page.route("**/manager/tools/Report?version=1.0.0", (route) =>
    route.fulfill({ json: report }),
  );
  await page.goto("/tools");
  const categories = page.getByRole("tablist", { name: "资源分类" });
  await expect(categories.getByRole("tab", { name: "全部" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByRole("button", { name: "查看读取文件" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "查看报告生成" }),
  ).toBeVisible();
  await expect(page.getByText("内部工具")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /安装|添加工具|停用/ }),
  ).toHaveCount(0);
  await categories.getByRole("tab", { name: "专家工具" }).click();
  await expect(page.getByRole("button", { name: "查看读取文件" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "查看报告生成" }).click();
  await expect(page.getByText("输入参数")).toBeVisible();
  await expect(page.getByRole("button", { name: "申请共享" })).toHaveCount(0);
});

test("resource management excludes tools", async ({ page }) => {
  await page.goto("/admin/grants");
  await expect(page.getByRole("link", { name: "使用授权" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "工具", exact: true }),
  ).toHaveCount(0);
});

test("users authorize a company connector in another tab, then add and cancel it separately", async ({
  context,
  page,
}) => {
  let authorized = false;
  let installed = false;
  const provider = "http://localhost:5187/test-oauth/authorize";
  const callback =
    "http://127.0.0.1:5187/connectors/oauth/callback?state=one&code=provider-code";
  await context.route(provider, (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      headers: { "Cross-Origin-Opener-Policy": "same-origin" },
      body: `<a href="${callback}">同意授权</a>`,
    }),
  );
  await context.route(/\/manager\/connectors\?/, (route) =>
    route.fulfill({
      json: {
        next_cursor: null,
        items: [{
          resource_id: "files",
          display_name: "文档连接器",
          description: "公司文档服务",
          is_usable: true,
          is_authorized: authorized,
          is_installed: installed,
          is_enabled: installed,
          auth_type: "oauth",
          payload: {},
        }],
      },
    }),
  );
  await page.route("**/manager/connectors/files/authorize", (route) => {
    expect(route.request().method()).toBe("POST");
    return route.fulfill({
      json: {
        authorization_url: provider,
        state: "one",
      },
    });
  });
  await context.route("**/manager/connectors/files/authorization/callback", (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe("Bearer test-only");
    expect(route.request().postDataJSON()).toEqual({ state: "one", code: "provider-code" });
    authorized = true;
    return route.fulfill({ json: { authorized } });
  });
  await page.route("**/manager/connectors/files/install", (route) => {
    expect(route.request().method()).toBe("POST");
    expect(authorized).toBe(true);
    installed = true;
    return route.fulfill({ json: {} });
  });
  await page.route("**/manager/connectors/files/installation", (route) => {
    expect(route.request().method()).toBe("DELETE");
    installed = false;
    return route.fulfill({ status: 204 });
  });
  await page.goto("/connectors");
  const card = page.getByTestId("catalog-card");
  await expect(card.getByRole("button", { name: "添加", exact: true })).toHaveCount(0);
  const newTab = context.waitForEvent("page", { timeout: 5_000 });
  await card.getByRole("button", { name: "授权", exact: true }).click();
  const authorizationTab = await newTab;
  await expect(authorizationTab).toHaveURL(provider);
  expect(await authorizationTab.evaluate(() => window.opener === null)).toBe(true);
  await expect(page).toHaveURL(/\/connectors$/);
  await expect(card.getByText("未授权", { exact: true })).toBeVisible();
  await authorizationTab.getByRole("link", { name: "同意授权" }).click();
  await expect(page.getByRole("status")).toContainText("连接器已授权，可以添加。");
  await expect.poll(() => authorizationTab.isClosed()).toBe(true);
  await card.getByRole("button", { name: "添加", exact: true }).click();
  await card.getByRole("button", { name: "取消添加", exact: true }).click();
  await expect(card.getByText("已授权", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "添加", exact: true })).toBeVisible();

  await card.getByRole("button", { name: "添加", exact: true }).click();
  await expect(card.getByRole("button", { name: "取消添加", exact: true })).toBeVisible();
  authorized = false;
  await page.reload();
  await expect(card.getByRole("button", { name: "授权", exact: true })).toBeVisible();
  await card.getByRole("button", { name: "取消添加", exact: true }).click();
  await expect(card.getByRole("button", { name: "取消添加", exact: true })).toHaveCount(0);
});
