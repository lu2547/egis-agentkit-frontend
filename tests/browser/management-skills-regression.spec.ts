import { expect, test } from "@playwright/test";
const pageOf = (items: unknown[]) => ({
  items,
  next_cursor: null,
  categories: [],
});
const owner = {
  user_id: "demo",
  username: "Frankie",
  role_type: "admin",
  group_ids: [],
  is_enabled: true,
};
const expert = {
  id: "owned",
  definition_type: "agent",
  agent_type: "expert",
  agent_name: "owned",
  agent_display_name: "我的专家",
  owner_type: "user",
  owner_id: "demo",
  resource_view_type: "private",
  resource_version: "v1",
  owner_version: 1,
  is_editable: true,
  is_deletable: true,
  is_usable: true,
  can_share: true,
  payload: {
    description: "自己的专家",
    category: "办公协同",
    tags: [],
    starter_prompts: [],
  },
};
test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
  await page.route("**/manager/me", (route) => route.fulfill({ json: owner }));
});

test("audited user edits submit only editable fields", async ({ page }) => {
  let saved: unknown;
  const row = {
    ...owner,
    created_at: "2026-11-24",
    updated_at: "2026-11-25",
    created_by: "sso",
    updated_by: "admin",
    identity_source_type: "sso",
  };
  await page.route(/\/manager\/admin\/users(?:\?|$)/, (route) =>
    route.fulfill({
      json: { items: [row], page: 1, page_size: 20, has_next: false },
    }),
  );
  await page.route("**/manager/admin/users/demo", (route) => {
    saved = route.request().postDataJSON();
    return route.fulfill({ json: {} });
  });
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "编辑用户" });
  await dialog.getByLabel("名称", { exact: true }).fill("新名称");
  await dialog.getByRole("button", { name: "保存用户" }).click();
  await expect(dialog).toBeHidden();
  expect(saved).toEqual({ ...owner, username: "新名称" });
});

test("owners withdraw one audience and delete their expert", async ({
  page,
}) => {
  let deleted = false;
  const withdrawn: string[] = [];
  const shares = [
    {
      review_id: "approved",
      resource_type: "agent",
      resource_id: "owned",
      resource_version: "v1",
      review_type: "share",
      share_scope_type: "group",
      principal_id: "company",
      review_status_type: "approved",
    },
    {
      review_id: "pending",
      resource_type: "agent",
      resource_id: "owned",
      resource_version: "v1",
      review_type: "share",
      share_scope_type: "user",
      principal_id: "alice",
      review_status_type: "pending",
    },
  ];
  await page.route(/\/manager\/agents(?:\?|$)/, (route) =>
    route.fulfill({ json: pageOf(deleted ? [] : [expert]) }),
  );
  await page.route(/\/manager\/agents\/owned(?:\?|$)/, (route) => {
    if (route.request().method() === "DELETE") {
      deleted = true;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: expert });
  });
  await page.route("**/manager/share-requests", (route) =>
    route.fulfill({
      json: {
        items: shares.map((row) =>
          withdrawn.includes(row.review_id)
            ? { ...row, review_status_type: "cancelled" }
            : row,
        ),
      },
    }),
  );
  await page.route(
    /\/manager\/share-requests\/(approved|pending)$/,
    (route) => {
      expect(route.request().method()).toBe("DELETE");
      withdrawn.push(route.request().url().split("/").pop()!);
      return route.fulfill({ status: 204 });
    },
  );
  await page.goto("/experts");
  await page.getByRole("button", { name: "查看我的专家" }).click();
  const dialog = page.getByRole("dialog", { name: "我的专家", exact: true });
  const sharesRegion = dialog.getByRole("region", { name: "共享管理" });
  await expect(sharesRegion).toContainText("组织组 · company");
  await sharesRegion.getByRole("button", { name: "撤回共享" }).click();
  await page.getByRole("button", { name: "确定", exact: true }).click();
  await expect(sharesRegion.getByRole("status")).toContainText("已撤回");
  await expect(
    sharesRegion.getByRole("button", { name: "取消申请" }),
  ).toBeVisible();
  expect(withdrawn).toEqual(["approved"]);
  await sharesRegion.getByRole("button", { name: "取消申请" }).click();
  await page.getByRole("button", { name: "确定", exact: true }).click();
  await expect(sharesRegion.getByRole("status")).toContainText("已取消");
  expect(withdrawn).toEqual(["approved", "pending"]);
  await dialog.getByRole("button", { name: "删除专家", exact: true }).click();
  await page.getByRole("button", { name: "确定", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("status")).toContainText("已删除");
  expect(deleted).toBe(true);
});

test("other users cannot manage ownership even if a shared detail is open", async ({
  page,
}) => {
  const shared = {
    ...expert,
    owner_id: "another",
    resource_view_type: "shared",
    is_editable: false,
    is_deletable: false,
    can_share: false,
  };
  await page.route(/\/manager\/agents(?:\?|$)/, (route) =>
    route.fulfill({ json: pageOf([shared]) }),
  );
  await page.route(/\/manager\/agents\/owned(?:\?|$)/, (route) =>
    route.fulfill({ json: shared }),
  );
  await page.goto("/experts");
  await page.getByRole("button", { name: "查看我的专家" }).click();
  const dialog = page.getByRole("dialog", { name: "我的专家", exact: true });
  await expect(dialog.getByRole("button", { name: "删除专家" })).toHaveCount(0);
  await expect(dialog.getByRole("region", { name: "共享管理" })).toHaveCount(0);
});

test("terminal import dismissal persists after refresh and a retry attempt resurfaces", async ({
  page,
}) => {
  let attempts = 1;
  let status = "failed";
  const job = () => ({
    job_id: "failed",
    filename: "broken.zip",
    status,
    stage: status,
    progress: 0,
    attempts,
    updated_at: "2026-11-25",
    error: "缺少 SKILL.md",
  });
  const active = {
    ...job(),
    job_id: "active",
    filename: "working.zip",
    status: "running",
  };
  await page.route("**/manager/skills/imports", (route) =>
    route.fulfill({ json: { items: [job(), active] } }),
  );
  await page.route("**/manager/skills/imports/failed/retry", (route) => {
    attempts++;
    status = "queued";
    return route.fulfill({ status: 202, json: job() });
  });
  await page.goto("/skills/upload");
  const imports = page.getByRole("region", { name: "技能导入任务" });
  await expect(imports).toContainText("broken.zip");
  await expect(
    imports.getByRole("button", { name: "关闭 working.zip 导入任务" }),
  ).toHaveCount(0);
  await imports
    .getByRole("button", { name: "关闭 broken.zip 导入任务" })
    .click();
  await expect(imports).not.toContainText("broken.zip");
  await page.reload();
  await expect(imports).toContainText("working.zip");
  await expect(imports).not.toContainText("broken.zip");
  attempts++;
  await page.reload();
  await expect(imports).toContainText("broken.zip");
  await imports.getByRole("button", { name: "重试导入", exact: true }).click();
  await expect(
    imports.getByRole("status").filter({ hasText: "重新提交" }),
  ).toBeVisible();
  await expect(
    imports.getByRole("button", { name: "关闭 broken.zip 导入任务" }),
  ).toHaveCount(0);
});

const skill = (id: string, name: string) => ({
  resource_id: id,
  resource_version: "v1",
  display_name: name,
  owner_type: "user",
  owner_id: "demo",
  resource_view_type: "private",
  is_usable: true,
  is_editable: true,
  is_deletable: true,
  is_enabled: true,
  can_share: true,
  description: "技能",
  payload: { category: "办公协同" },
});

test("expert skill bindings retain selections through server pages and search", async ({
  page,
}) => {
  const first = skill("first", "第一页技能"),
    second = skill("second", "第二页技能"),
    found = skill("found", "搜索技能");
  const queries: URLSearchParams[] = [];
  let saved: any;
  await page.route(/\/manager\/skills(?:\?|$)/, (route) => {
    const params = new URL(route.request().url()).searchParams;
    queries.push(params);
    const search = params.get("query");
    return route.fulfill({
      json: {
        ...pageOf(search ? [found] : params.get("cursor") ? [second] : [first]),
        next_cursor: search || params.get("cursor") ? null : "page2",
      },
    });
  });
  await page.route(/\/manager\/agents(?:\?|$)/, (route) => {
    if (route.request().method() === "POST") {
      saved = route.request().postDataJSON();
      return route.fulfill({ json: { ...expert, id: "new" } });
    }
    return route.fulfill({ json: pageOf([]) });
  });
  await page.goto("/experts/new");
  await page.getByLabel(/英文名称/).fill("paged_expert");
  await page.getByLabel(/展示名称/).fill("分页专家");
  const picker = page.getByLabel("绑定技能", { exact: true });
  await picker.click();
  await page
    .getByRole("listitem", { name: "第一页技能 · v1", exact: true })
    .click();
  await page.getByRole("button", { name: "加载更多技能" }).click();
  await picker
    .locator("xpath=ancestor::div[contains(@class,'field')][1]")
    .locator(".t-select")
    .click();
  await page
    .getByRole("listitem", { name: "第二页技能 · v1", exact: true })
    .click();
  await picker
    .locator("xpath=ancestor::div[contains(@class,'field')][1]")
    .locator(".t-select")
    .click();
  await page.keyboard.type("搜索");
  await expect
    .poll(() => queries.some((params) => params.get("query") === "搜索"))
    .toBe(true);
  await page
    .getByRole("listitem", { name: "搜索技能 · v1", exact: true })
    .click();
  await page.getByRole("button", { name: "保存专家", exact: true }).click();
  await expect(page).toHaveURL("/experts");
  expect(saved.payload.bindings).toEqual(
    [first, second, found].map((item) => ({
      resource_type: "skill",
      resource_id: item.resource_id,
      resource_view_type: "private",
      resource_version: "v1",
    })),
  );
  expect(queries.every((params) => params.has("limit"))).toBe(true);
});

test("batch sharing keeps full selections across pages and reports success", async ({
  page,
}) => {
  const first = skill("first", "第一页技能"),
    second = skill("second", "第二页技能");
  let saved: unknown;
  await page.route(/\/manager\/skills(?:\?|$)/, (route) => {
    const params = new URL(route.request().url()).searchParams;
    const selecting = params.get("mine") === "true";
    return route.fulfill({
      json: {
        ...pageOf(params.get("cursor") ? [second] : [first]),
        has_shareable: true,
        next_cursor: selecting && !params.get("cursor") ? "page2" : null,
      },
    });
  });
  await page.route("**/manager/share-requests/batch", (route) => {
    saved = route.request().postDataJSON();
    return route.fulfill({
      json: {
        items: [
          { id: "first", success: true },
          { id: "second", success: true },
        ],
      },
    });
  });
  await page.goto("/skills");
  await page.getByRole("button", { name: "批量申请共享" }).click();
  const dialog = page.getByRole("dialog", { name: "批量申请共享" });
  const picker = dialog.getByLabel("技能", { exact: true });
  await picker.click();
  await page.getByRole("listitem", { name: "第一页技能", exact: true }).click();
  await dialog.getByRole("button", { name: "加载更多技能" }).click();
  await picker
    .locator("xpath=ancestor::div[contains(@class,'field')][1]")
    .locator(".t-select")
    .click();
  await page.getByRole("listitem", { name: "第二页技能", exact: true }).click();
  await dialog.getByLabel("接收对象", { exact: true }).click();
  await page.getByText("分析师 · analyst", { exact: true }).click();
  await dialog.getByRole("button", { name: "提交共享申请" }).click();
  await expect(dialog.getByRole("status")).toContainText(
    "成功 2 项，失败 0 项",
  );
  expect(saved).toEqual({
    resource_ids: ["first", "second"],
    target: { principal_type: "user", principal_id: "analyst" },
  });
});

test("direct grants page system skill choices and show a success result", async ({
  page,
}) => {
  const systemSkill = {
    ...skill("system", "系统技能"),
    owner_type: "system",
    owner_id: "engineering",
    resource_view_type: "system",
  };
  const requests: string[] = [];
  let saved: unknown;
  await page.route(/\/manager\/admin\/grant-resources(?:\?|$)/, (route) => {
    requests.push(route.request().url());
    return route.fulfill({ json: { items: [] } });
  });
  await page.route(/\/manager\/skills(?:\?|$)/, (route) => {
    const params = new URL(route.request().url()).searchParams;
    expect(params.get("purpose")).toBe("grant");
    expect(params.get("owner_type")).toBe("system");
    return route.fulfill({ json: pageOf([systemSkill]) });
  });
  await page.route(/\/manager\/admin\/grants(?:\?|$)/, (route) => {
    if (route.request().method() === "POST") {
      saved = route.request().postDataJSON();
      return route.fulfill({ json: {} });
    }
    return route.fulfill({
      json: { items: [], page: 1, page_size: 20, has_next: false },
    });
  });
  await page.goto("/admin/grants");
  await page.getByRole("button", { name: "授予使用权限", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "授予使用权限",
    exact: true,
  });
  await dialog.getByText("技能", { exact: true }).click();
  await dialog.getByLabel("资源", { exact: true }).click();
  await page.getByRole("listitem", { name: "系统技能", exact: true }).click();
  await dialog.getByLabel("授权对象", { exact: true }).click();
  await page.getByText("分析师 · analyst", { exact: true }).click();
  await dialog
    .getByRole("button", { name: "授予使用权限", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("status")).toContainText("使用权限已授予");
  expect(
    requests.every(
      (url) => new URL(url).searchParams.get("include_skills") === "false",
    ),
  ).toBe(true);
  expect(saved).toEqual({
    resource_type: "skill",
    resource_id: "system",
    resource_owner_type: "system",
    resource_owner_id: "engineering",
    resource_view_type: "system",
    principal_type: "user",
    principal_id: "analyst",
  });
});

test("editing the current admin role immediately refreshes visible permissions", async ({
  page,
}) => {
  let demoted = false;
  await page.unroute("**/manager/me");
  await page.route("**/manager/me", (route) =>
    route.fulfill({
      json: { ...owner, role_type: demoted ? "user" : "admin" },
    }),
  );
  await page.route(/\/manager\/admin\/users(?:\?|$)/, (route) =>
    route.fulfill({
      json: { items: [owner], page: 1, page_size: 20, has_next: false },
    }),
  );
  await page.route("**/manager/admin/users/demo", (route) => {
    expect(route.request().postDataJSON().role_type).toBe("user");
    demoted = true;
    return route.fulfill({ json: {} });
  });
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "编辑用户" });
  await dialog.getByLabel("角色", { exact: true }).click();
  await page.getByRole("listitem", { name: "普通用户", exact: true }).click();
  await dialog.getByRole("button", { name: "保存用户" }).click();
  await expect(page.getByRole("navigation", { name: "管理功能" })).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "此页面仅管理员可访问" }),
  ).toBeVisible();
});

test("sharing to another recipient labels the approved version and confirms submission", async ({
  page,
}) => {
  const latest = {
    ...expert,
    resource_version: "private-v2",
    version_label: "2.0.0",
    has_shared_version: true,
    share_version: "approved-v1",
    share_version_label: "1.0.0",
    can_share_update: true,
  };
  await page.route(/\/manager\/agents(?:\?|$)/, (route) =>
    route.fulfill({ json: pageOf([latest]) }),
  );
  await page.route(/\/manager\/agents\/owned(?:\?|$)/, (route) =>
    route.fulfill({ json: latest }),
  );
  let submitted = false;
  await page.route("**/manager/share-requests", (route) => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON()).toEqual({
        resource_type: "agent",
        resource_id: "owned",
        target: { principal_type: "user", principal_id: "analyst" },
      });
      submitted = true;
      return route.fulfill({ json: {} });
    }
    return route.fulfill({ json: { items: [] } });
  });
  await page.goto("/experts");
  await page.getByRole("button", { name: "查看我的专家" }).click();
  await page
    .getByRole("dialog", { name: "我的专家", exact: true })
    .getByRole("button", { name: "申请共享", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "申请共享", exact: true });
  await expect(dialog).toContainText("共享版本 1.0.0");
  await dialog.getByLabel("接收对象", { exact: true }).click();
  await page.getByText("分析师 · analyst", { exact: true }).click();
  await dialog.getByRole("button", { name: "提交共享申请" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("status")).toContainText("共享申请已提交");
  expect(submitted).toBe(true);
});
