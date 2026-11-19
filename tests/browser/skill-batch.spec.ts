import { expect, test } from "@playwright/test";

const target = { principal_type: "group", principal_id: "company" };
const report = {
  resource_id: "report",
  display_name: "报告技能",
  resource_view_type: "private",
  owner_id: "demo",
  owner_type: "user",
  can_share: true,
  payload: {},
};
const research = {
  ...report,
  resource_id: "research",
  display_name: "研究技能",
};

test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
});

test("owners can submit private skills together and retry a failed item", async ({
  page,
}) => {
  await page.route("**/manager/me", (route) =>
    route.fulfill({
      json: {
        user_id: "demo",
        username: "Frankie",
        role_type: "user",
        group_ids: ["company"],
        is_enabled: true,
      },
    }),
  );
  let optionsRequests = 0;
  await page.route(/\/manager\/skills(?:\?|$)/, (route) => {
    const catalog = new URL(route.request().url()).searchParams.get("catalog") === "true";
    if (!catalog) optionsRequests++;
    return route.fulfill({
      json: catalog
        ? { items: [report], next_cursor: "10", categories: [], has_shareable: true }
        : { items: [report, research] },
    });
  });
  let attempts = 0;
  await page.route("**/manager/share-requests/batch", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({
      resource_ids: attempts === 0 ? ["report", "research"] : ["research"],
      target,
    });
    return route.fulfill({
      json: {
        items:
          attempts++ === 0
            ? [
                { id: "report", success: true },
                {
                  id: "research",
                  success: false,
                  status_code: 409,
                  detail: "源资源已经停用",
                },
              ]
            : [{ id: "research", success: true }],
      },
    });
  });

  await page.goto("/skills");
  await expect(
    page.getByRole("button", { name: "查看报告技能" }),
  ).toBeVisible();
  expect(optionsRequests).toBe(0);
  await page.getByRole("button", { name: "批量申请共享" }).click();
  const dialog = page.getByRole("dialog", { name: "批量申请共享" });
  await dialog.getByLabel("技能", { exact: true }).click();
  await page.getByRole("listitem", { name: "报告技能", exact: true }).click();
  await page.getByRole("listitem", { name: "研究技能", exact: true }).click();
  expect(optionsRequests).toBe(1);
  await dialog.getByText("用户组", { exact: true }).click();
  await dialog.getByLabel("接收对象", { exact: true }).click();
  await page.getByText("全公司 · company", { exact: true }).click();
  const submit = dialog.getByRole("button", { name: "提交共享申请" });
  await submit.click();
  await expect(dialog.getByRole("status")).toContainText(
    "成功 1 项，失败 1 项",
  );
  await expect(dialog.getByText("研究技能 · 源资源已经停用")).toBeVisible();
  await submit.click();
  await expect(dialog.getByRole("status")).toContainText(
    "成功 1 项，失败 0 项",
  );
});

test("administrators can review selected pending skills and see results after refresh", async ({
  page,
}) => {
  const first = {
    review_id: "first",
    resource_type: "skill",
    resource_id: "report",
    resource_version: "1.0.0",
    review_status_type: "pending",
  };
  const second = { ...first, review_id: "second", resource_id: "research" };
  const expert = {
    ...first,
    review_id: "expert",
    resource_type: "agent",
    resource_id: "expert",
  };
  let approved = false;
  await page.route(/\/manager\/admin\/share-reviews(?:\?|$)/, (route) =>
    route.fulfill({
      json: {
        page: 1,
        page_size: 20,
        has_next: false,
        items: [
          approved ? { ...first, review_status_type: "approved" } : first,
          second,
          expert,
        ],
      },
    }),
  );
  await page.route(
    "**/manager/admin/share-reviews/batch/decision",
    async (route) => {
      expect(route.request().postDataJSON()).toEqual({
        review_ids: ["first", "second"],
        is_approved: true,
        reason: "已确认内容",
      });
      approved = true;
      return route.fulfill({
        json: {
          items: [
            { id: "first", success: true },
            {
              id: "second",
              success: false,
              status_code: 409,
              detail: "源资源已经停用",
            },
          ],
        },
      });
    },
  );

  await page.goto("/admin/share-reviews");
  await expect(page.getByRole("checkbox", { name: "选择 expert" })).toHaveCount(
    0,
  );
  await page.getByRole("checkbox", { name: "选择 report" }).check();
  await page.getByRole("checkbox", { name: "选择 research" }).check();
  await page.getByRole("button", { name: "批量审核", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "批量审核" });
  await dialog.getByLabel("审核意见").fill("已确认内容");
  await dialog.getByRole("button", { name: "批量通过" }).click();
  await expect(page.getByText("已通过", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("成功 1 项，失败 1 项");
  await expect(
    page.getByRole("checkbox", { name: "选择 research" }),
  ).toBeChecked();
});

test("administrators can grant selected system skills to a common recipient", async ({
  page,
}) => {
  const system = {
    resource_type: "skill",
    resource_view_type: "system",
    resource_owner_type: "system",
    resource_owner_id: "engineering",
  };
  await page.route("**/manager/admin/grant-resources", (route) =>
    route.fulfill({
      json: {
        items: [
          { ...system, resource_id: "report", display_name: "报告技能" },
          { ...system, resource_id: "research", display_name: "研究技能" },
          {
            ...system,
            resource_id: "private",
            display_name: "个人技能",
            resource_view_type: "shared",
            resource_owner_type: "user",
            resource_owner_id: "demo",
          },
        ],
      },
    }),
  );
  await page.route("**/manager/admin/grants/batch", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      resources: [
        { resource_id: "report", resource_owner_id: "engineering" },
        { resource_id: "research", resource_owner_id: "engineering" },
      ],
      target,
    });
    return route.fulfill({
      json: {
        items: [
          { id: "report", success: true },
          { id: "research", success: true },
        ],
      },
    });
  });

  await page.goto("/admin/grants");
  await page.getByRole("button", { name: "批量授权技能" }).click();
  const dialog = page.getByRole("dialog", { name: "批量授权技能" });
  await dialog.getByLabel("技能", { exact: true }).click();
  await expect(page.getByText("个人技能", { exact: true })).toHaveCount(0);
  await page.getByText("报告技能", { exact: true }).click();
  await page.getByText("研究技能", { exact: true }).click();
  await dialog.getByText("用户组", { exact: true }).click();
  await dialog.getByLabel("接收对象", { exact: true }).click();
  await page.getByText("全公司 · company", { exact: true }).click();
  await dialog.getByRole("button", { name: "授予使用权限" }).click();
  await expect(dialog.getByRole("status")).toContainText(
    "成功 2 项，失败 0 项",
  );
});
