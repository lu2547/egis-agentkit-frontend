import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
});

for (const [skill, owner] of [
  ["研究方法", "系统"],
  ["会议纪要", "李晓"],
]) {
  test(`skill catalog and details show ${owner} as the owner of ${skill}`, async ({
    page,
  }) => {
    await page.goto("/skills");
    const open = page.getByRole("button", { name: `查看${skill}`, exact: true });
    const card = page.getByTestId("catalog-card").filter({ has: open });
    await expect(card.getByText(owner, { exact: true })).toBeVisible();
    await open.click();
    const details = page.locator(".resource-detail");
    await expect(details.locator(".markdown")).toBeVisible();
    await expect(details.getByText(owner, { exact: true })).toBeVisible();
  });
}

for (const theme of ["light", "dark"]) {
  test(`skill editing loads original document and retains attachments in ${theme}`, async ({
    page,
  }) => {
    await page.addInitScript(
      (value) => localStorage.setItem("pension-gpt-theme", value),
      theme,
    );
    await page.goto("/skills");
    await page
      .getByTestId("catalog-card")
      .filter({ hasText: "报告写作" })
      .getByRole("button", { name: "报告写作的技能操作", exact: true })
      .click();
    await page.getByRole("menuitem", { name: "编辑", exact: true }).click();
    await expect(page).toHaveURL(/\/skills\/writing\/edit\?version=1.0.0$/);
    await expect(
      page.getByRole("heading", { name: "编辑技能", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("在技能广场展示", { exact: false })).toHaveCount(0);
    const document = page.getByRole("textbox", {
      name: "SKILL.md 文档",
      exact: true,
    });
    await expect(document).toHaveValue(/name: 报告写作/);
    await expect(document).toHaveValue(/version: 1.0.0/);
    await expect(page.getByRole("region", { name: "技能附件" })).toContainText(
      "references/style.md",
    );
    await expect(page.getByRole("region", { name: "技能附件" })).toContainText(
      "scripts/check.py",
    );
    await page.screenshot({ path: `docs/screenshots/skills/skill-edit-${theme}.png`, fullPage: true });
    await document.fill(
      (await document.inputValue()).replace(
        "version: 1.0.0",
        "metadata:\n  version: 1.0.1",
      ),
    );
    const saving = page.waitForRequest(
      (request) =>
        request.url().endsWith("/manager/skills/writing") &&
        request.method() === "PUT",
    );
    await page.getByRole("button", { name: "发布版本", exact: true }).click();
    const body = (await saving).postDataJSON();
    expect(body.base_version).toBe("1.0.0");
    expect(body.markdown).toContain("metadata:\n  version: 1.0.1");
    expect(body).not.toHaveProperty("resource_version");
    expect(body).not.toHaveProperty("is_skill_market_visible");
    await expect(page).toHaveURL("/skills");
  });
}

test("imports keep processing after returning to the catalog and only appear when completed", async ({
  page,
}) => {
  await page.goto("/skills/upload");
  await expect(page.getByRole("group", { name: "选择头像" })).toHaveCount(0);
  await expect(page.getByText("AI 自动生成", { exact: false })).toBeVisible();
  await page.getByLabel("选择技能文件").setInputFiles({
    name: "async-skill.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("test-package"),
  });
  await page.getByRole("button", { name: "提交导入", exact: true }).click();
  const imports = page.getByRole("region", { name: "技能导入任务" });
  await expect(imports).toContainText("等待处理");
  await expect(
    page.getByRole("button", { name: "提交导入", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "返回技能目录", exact: true }).click();
  await expect(page).toHaveURL("/skills");
  await expect(
    page.getByTestId("catalog-card").filter({ hasText: "导入的技能" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("progressbar", { name: "async-skill.zip 导入进度" }),
  ).toBeVisible();
  const imported = page.getByTestId("catalog-card").filter({ hasText: "导入的技能" });
  await expect(imported).toBeVisible({ timeout: 10000 });
  await expect(imports).toHaveCount(0);
  await page.reload();
  await expect(imported).toBeVisible();
  await expect(imports).toHaveCount(0);
  await expect(imported.locator(".catalog-avatar")).toHaveText("导");
});

test("loads generated skill avatar through the authorized version endpoint", async ({
  page,
}) => {
  await page.route(/\/api\/manager\/skills\?/, async (route) => {
    const original = await route.fetch();
    const payload = await original.json();
    const skill = payload.items.find(
      (item: { resource_id: string }) => item.resource_id === "writing",
    );
    skill.payload.avatar = "auto";
    skill.payload.has_generated_avatar = true;
    await route.fulfill({ json: payload });
  });
  await page.route("**/api/manager/skills/writing/avatar?version=1.0.0", (route) => {
    expect(route.request().headers().authorization).toBe("Bearer test-only");
    return route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M12 30 L25 43 L51 18" fill="none" stroke="#32a170"/></svg>',
    });
  });
  await page.goto("/skills");
  const card = page.getByTestId("catalog-card").filter({ hasText: "报告写作" });
  const image = card.locator(".catalog-avatar img");
  await expect(image).toHaveAttribute("src", /^blob:/);
  await expect(image).toBeVisible();
});

test("the owner can confirm deletion of a skill from the catalog", async ({ page }) => {
  let deleted = false;
  await page.route(/\/api\/manager\/skills\?/, async (route) => {
    const original = await route.fetch();
    const payload = await original.json();
    payload.items = payload.items
      .filter((item: { resource_id: string }) => !deleted || item.resource_id !== "writing")
      .map((item: { resource_id: string }) => ({
        ...item,
        is_deletable: item.resource_id === "writing",
      }));
    await route.fulfill({ json: payload });
  });
  await page.route("**/api/manager/skills/writing", (route) => {
    expect(route.request().method()).toBe("DELETE");
    deleted = true;
    return route.fulfill({ status: 204 });
  });
  await page.goto("/skills");
  await expect(page.getByRole("button", { name: "会议纪要的技能操作" })).toHaveCount(0);
  const ownerMenu = page.getByRole("button", { name: "报告写作的技能操作" });
  const selection = page.getByRole("button", { name: "停用报告写作" });
  await expect(selection).toBeVisible();
  const menuBounds = (await ownerMenu.boundingBox())!;
  const selectionBounds = (await selection.boundingBox())!;
  expect(menuBounds.y).toBeLessThan(selectionBounds.y);
  expect(menuBounds.x + menuBounds.width).toBeCloseTo(
    selectionBounds.x + selectionBounds.width,
  );
  await expect(page.getByRole("menuitem", { name: "删除", exact: true })).toHaveCount(0);
  await ownerMenu.click();
  await expect(page.getByRole("menuitem", { name: "编辑", exact: true })).toBeVisible();
  await page.getByRole("menuitem", { name: "删除", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "删除技能" });
  await expect(confirmation).toContainText("删除「报告写作」的所有版本，并撤销选用和共享？");
  await confirmation.getByRole("button", { name: "取消", exact: true }).click();
  expect(deleted).toBe(false);
  await ownerMenu.click();
  await page.getByRole("menuitem", { name: "删除", exact: true }).click();
  await confirmation.getByRole("button", { name: "删除", exact: true }).click();
  await expect(page.getByRole("button", { name: "查看报告写作" })).toHaveCount(0);
  expect(deleted).toBe(true);
});

test("failed import exposes its error and retries as a queued job", async ({
  page,
}) => {
  let status = "failed";
  const job = () => ({
    job_id: "failed-1",
    filename: "broken.zip",
    status,
    stage: status === "failed" ? "failed" : "queued",
    progress: 0,
    error: status === "failed" ? "技能包缺少 SKILL.md" : null,
    attempts: 1,
  });
  await page.route("**/api/manager/skills/imports", (route) =>
    route.fulfill({ json: { items: [job()] } }),
  );
  await page.route("**/api/manager/skills/imports/failed-1/retry", (route) => {
    status = "queued";
    return route.fulfill({ status: 202, json: job() });
  });
  await page.goto("/skills/upload");
  const imports = page.getByRole("region", { name: "技能导入任务" });
  await expect(imports).toContainText("技能包缺少 SKILL.md");
  await imports.getByRole("button", { name: "重试导入", exact: true }).click();
  await expect(imports).toContainText("等待处理");
  await expect(
    imports.getByRole("button", { name: "重试导入", exact: true }),
  ).toHaveCount(0);
});

test("large skills paginate and search all attachments without rendering thousands of rows", async ({
  page,
}) => {
  await page.route("**/api/manager/skills/writing?**", async (route) => {
    const original = await (await route.fetch()).json();
    original.payload.files = Array.from({ length: 13055 }, (_, index) => ({
      path: `references/file-${index}.txt`,
      size: 100,
    }));
    await route.fulfill({ json: original });
  });
  await page.goto("/skills/writing/edit?version=1.0.0");
  const attachments = page.getByRole("region", { name: "技能附件" });
  await expect(attachments.locator("li")).toHaveCount(50);
  await attachments
    .getByRole("button", { name: "下一页", exact: true })
    .click();
  await expect(attachments.locator("li").first()).toContainText("file-50.txt");
  await attachments
    .getByRole("searchbox", { name: "搜索技能附件" })
    .fill("file-13054.txt");
  await expect(attachments.locator("li")).toHaveCount(1);
  await expect(attachments).toContainText("file-13054.txt");
});
