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
  await page.route("**/manager/skills", (route) =>
    route.fulfill({
      json: {
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
  await page.getByRole("button", { name: "取消选用", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "安装报告技能", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "查看报告技能", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "取消选用", exact: true }),
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
  const internal = {
    ...tool,
    resource_id: "Internal",
    display_name: "内部工具",
    payload: { exposure: "internal" },
  };
  await page.route("**/manager/tools", (route) =>
    route.fulfill({ json: { items: [defaultTool, report, internal] } }),
  );
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

test("connector callback exchanges the code for the selected immutable version", async ({
  page,
}) => {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "egis-mcp-oauth:one",
      JSON.stringify({ resourceId: "files", version: "2.0.0" }),
    );
  });
  await page.route(
    "**/manager/connectors/files/authorization/callback?version=2.0.0",
    (route) => {
      expect(route.request().method()).toBe("POST");
      expect(route.request().postDataJSON()).toEqual({
        state: "one",
        code: "provider-code",
      });
      return route.fulfill({ json: { authorized: true } });
    },
  );
  await page.goto("/connectors?state=one&code=provider-code");
  await expect(page).toHaveURL(/\/connectors$/);
  await expect(page.getByRole("status")).toContainText("连接器已授权。");
});

test("an expert-only connector accepts personal credentials outside the marketplace", async ({
  page,
}) => {
  await page.route("**/manager/connectors", (route) =>
    route.fulfill({
      json: {
        items: [],
        dependency_authorizations: [
          {
            resource_id: "scoped",
            resource_version: "1.0.0",
            display_name: "财务专家连接",
            auth_type: "api_key",
          },
        ],
      },
    }),
  );
  await page.route(
    "**/manager/connectors/scoped/authorization?version=1.0.0",
    (route) => route.fulfill({ json: { authorized: false } }),
  );
  await page.route(
    "**/manager/connectors/scoped/authorization/key?version=1.0.0",
    (route) => {
      expect(route.request().postDataJSON()).toEqual({
        key: "demo-personal-key",
      });
      return route.fulfill({ json: { authorized: true } });
    },
  );
  await page.goto("/connectors");
  const section = page.getByRole("region", { name: "专家连接授权" });
  await section.getByText("财务专家连接 · 1.0.0", { exact: true }).click();
  await section.getByLabel("个人 API Key").fill("demo-personal-key");
  await section.getByRole("button", { name: "保存密钥", exact: true }).click();
  await expect(section.getByText("已授权", { exact: true })).toBeVisible();
  await expect(
    section.getByRole("button", { name: "安装", exact: true }),
  ).toHaveCount(0);
});
