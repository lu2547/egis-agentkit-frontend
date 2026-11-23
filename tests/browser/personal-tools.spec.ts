import { expect, test } from "@playwright/test";

test("optional tools persist as personal assistant selections while basic and expert tools stay read-only", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
  let installed = false,
    enabled = false;
  const card = () => ({
    resource_id: "KnowledgeBaseSearch",
    resource_version: "1.1.0",
    resource_view_type: "system",
    owner_type: "system",
    owner_id: "system",
    display_name: "知识库检索",
    description: "检索企业文档和 Wiki",
    is_usable: true,
    is_available: true,
    is_editable: false,
    is_deletable: false,
    is_optional_tool: true,
    is_system_default: false,
    is_agent_tool: false,
    is_installed: installed,
    is_enabled: enabled,
    payload: {},
  });
  const basic = {
    ...card(),
    resource_id: "Read",
    display_name: "读取文件",
    is_optional_tool: false,
    is_system_default: true,
    is_installed: true,
    is_enabled: true,
  };
  const expert = {
    ...card(),
    resource_id: "Report",
    display_name: "报告生成",
    is_optional_tool: false,
    is_agent_tool: true,
  };
  await page.route("**/api/manager/tools?**", (route) => {
    const category = new URL(route.request().url()).searchParams.get(
      "category",
    );
    return route.fulfill({
      json: {
        items: category === "可选工具" ? [card()] : [basic, card(), expert],
        next_cursor: null,
        categories: ["系统默认", "可选工具", "专家工具"],
      },
    });
  });
  await page.route(
    "**/api/manager/tools/KnowledgeBaseSearch/install",
    (route) => {
      installed = enabled = true;
      return route.fulfill({ json: card() });
    },
  );
  await page.route(
    "**/api/manager/tools/KnowledgeBaseSearch/installation",
    (route) => {
      enabled = route.request().postDataJSON().is_enabled;
      return route.fulfill({ json: card() });
    },
  );
  await page.goto("/tools");
  await expect(
    page.getByRole("button", { name: /选用读取文件|选用报告生成/ }),
  ).toHaveCount(0);
  const select = page.getByRole("button", {
    name: "选用知识库检索",
    exact: true,
  });
  await expect(select).toBeVisible();
  await select.click();
  await expect(
    page.getByRole("button", { name: "停用知识库检索", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await page.getByRole("tab", { name: "可选工具", exact: true }).click();
  await page
    .getByRole("button", { name: "停用知识库检索", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "启用知识库检索", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "启用知识库检索", exact: true }),
  ).toBeVisible();
});

test("a failed optional-tool save keeps it unselected and shows the error", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
  await page.route("**/api/manager/tools?**", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            resource_id: "KnowledgeBaseSearch",
            resource_version: "1.1.0",
            resource_view_type: "system",
            owner_type: "system",
            owner_id: "system",
            display_name: "知识库检索",
            description: "企业检索",
            is_usable: true,
            is_available: true,
            is_optional_tool: true,
            is_system_default: false,
            is_agent_tool: false,
            is_editable: false,
            is_deletable: false,
            is_installed: false,
            is_enabled: false,
            payload: {},
          },
        ],
        next_cursor: null,
      },
    }),
  );
  await page.route(
    "**/api/manager/tools/KnowledgeBaseSearch/install",
    (route) => route.fulfill({ status: 403, json: { detail: "工具尚未开放" } }),
  );
  await page.goto("/tools");
  const select = page.getByRole("button", {
    name: "选用知识库检索",
    exact: true,
  });
  await select.click();
  await expect(page.getByRole("alert")).toContainText("工具尚未开放");
  await expect(select).toHaveAttribute("aria-pressed", "false");
});
