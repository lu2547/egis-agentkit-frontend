import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
});

test("administrator issues a credential for a virtual user", async ({
  page,
}) => {
  const account = {
    user_id: "skill-system.integration",
    username: "知识平台",
    is_enabled: true,
  };
  let created = false;
  await page.route(/\/manager\/admin\/virtual-users(?:\?|$)/, (route) => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON()).toEqual({ username: "知识平台" });
      created = true;
      return route.fulfill({
        status: 201,
        json: { ...account, token: "one-time" },
      });
    }
    return route.fulfill({
      json: {
        items: created ? [account] : [],
        page: 1,
        page_size: 20,
        has_next: false,
      },
    });
  });

  await page.goto("/admin/users");
  await page.getByRole("button", { name: "添加虚拟用户" }).click();
  await page.getByLabel("对接系统名称").fill("知识平台");
  await page.getByRole("button", { name: "签发凭证" }).click();
  await expect(page.getByLabel(/凭证仅显示一次/)).toHaveValue("one-time");
  await page.getByRole("button", { name: "关闭", exact: true }).last().click();
  await expect(page.getByText("知识平台", { exact: true })).toBeVisible();
  await expect(page.getByLabel(/凭证仅显示一次/)).toHaveCount(0);
});

test("administrator can upload and approve multiple system skills", async ({
  page,
}) => {
  const pending = (job_id: string, display_name: string) => ({
    job_id,
    filename: `${job_id}.zip`,
    owner_type: "system",
    uploader_type: "virtual",
    uploaded_by: "skill-system.integration",
    resource_version: "1.0.0",
    status: "pending_approval",
    result: { display_name },
  });
  const report = pending("first", "报告提取");
  const notes = pending("second", "会议总结");
  let approved = false;
  await page.route(/\/manager\/admin\/skill-imports(?:\?|$)/, (route) =>
    route.fulfill({
      json: {
        items: approved ? [] : [report, notes],
        page: 1,
        page_size: 20,
        has_next: false,
      },
    }),
  );
  await page.route("**/manager/admin/skill-imports/batch/decision", (route) => {
    expect(route.request().postDataJSON()).toEqual({
      job_ids: ["first", "second"],
      approved: true,
      reason: "",
    });
    approved = true;
    return route.fulfill({
      json: {
        items: [
          { id: "first", ok: true },
          { id: "second", ok: true },
        ],
      },
    });
  });
  await page.route("**/manager/skills/imports", (route) => {
    if (route.request().method() === "POST") {
      expect(route.request().postData()).toMatch(
        /name="owner_type"\r\n\r\nsystem/,
      );
      return route.fulfill({ status: 202, json: report });
    }
    return route.fulfill({ json: { items: [] } });
  });

  await page.goto("/admin/skills");
  await page.getByRole("link", { name: "上传系统技能" }).click();
  await expect(page).toHaveURL("/skills/upload?system=1");
  await page.getByLabel("选择技能文件").setInputFiles({
    name: "report.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("mock zip"),
  });
  await page.getByRole("button", { name: "提交导入" }).click();
  await expect(
    page.getByRole("region", { name: "技能导入任务" }),
  ).toContainText("待审核");
  await page.getByRole("button", { name: "返回技能管理" }).click();
  const reviews = page.getByRole("region", {
    name: "系统技能导入审核",
    exact: true,
  });
  await reviews.getByRole("checkbox", { name: /报告提取/ }).check();
  await reviews.getByRole("checkbox", { name: /会议总结/ }).check();
  await reviews.getByRole("button", { name: "通过所选" }).click();
  await expect(reviews).toContainText("暂无待审核的导入");
});
