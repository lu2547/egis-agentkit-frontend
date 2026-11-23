import { test, expect } from "@playwright/test";

test("workspace breadcrumb restores the root after opening its artifacts folder", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
  await page.route("**/api/manager/projects/project-1/files?**", (route) => {
    const area = new URL(route.request().url()).searchParams.get("area");
    return route.fulfill({
      json: {
        items:
          area === "uploads"
            ? [
                {
                  name: "项目资料.docx",
                  path: "项目资料.docx",
                  is_directory: false,
                  size: 100,
                  modified_at: "",
                },
              ]
            : [],
      },
    });
  });
  await page.goto("/tasks/s1");
  const panel = page.locator(".workspace-panel");
  await expect(
    panel.locator("button.file-open").filter({ hasText: "项目资料.docx" }),
  ).toBeVisible();
  await panel.locator("button.file-open").filter({ hasText: "产物" }).click();
  await expect(panel.locator(".breadcrumb")).toHaveText("工作空间/产物");
  await expect(panel.getByText("暂无文件", { exact: true })).toBeVisible();
  await panel
    .locator(".breadcrumb")
    .getByRole("button", { name: "工作空间", exact: true })
    .click();
  await expect(panel.locator(".breadcrumb")).toHaveText("工作空间");
  await expect(
    panel.locator("button.file-open").filter({ hasText: "项目资料.docx" }),
  ).toBeVisible();
  await expect(
    panel.locator("button.file-open").filter({ hasText: ".work" }),
  ).toBeVisible();
  await expect(
    panel.locator("button.file-open").filter({ hasText: "产物" }),
  ).toBeVisible();
});

for (const theme of ["light", "dark"] as const) {
  test(`${theme} workspace shows flat uploads, hidden work and deliveries with correct preview locations`, async ({
    page,
    request,
  }, testInfo) => {
    await request.post("http://127.0.0.1:38194/__test/reset");
    await page.addInitScript((value) => {
      sessionStorage.setItem("egis_access_token", "test-only");
      localStorage.setItem("pension-gpt-theme", value);
    }, theme);
    const entry = (name: string, path = name, is_directory = false) => ({
      name,
      path,
      is_directory,
      size: 100,
      modified_at: "",
    });
    let uploaded = false;
    await page.route("**/api/manager/projects/project-1/files?**", (route) => {
      const query = new URL(route.request().url()).searchParams;
      const area = query.get("area"),
        path = query.get("path") || "";
      if (route.request().method() === "POST") {
        uploaded = true;
        return route.fulfill({
          json: { ...entry("新增资料.txt"), area: "uploads" },
        });
      }
      const items =
        area === "uploads"
          ? path === "资料"
            ? [entry("背景.md", "资料/背景.md")]
            : [
                entry("需求.md"),
                entry("资料", "资料", true),
                ...(uploaded ? [entry("新增资料.txt")] : []),
              ]
          : area === "work"
            ? [entry("generate.py")]
            : [entry("report.md")];
      return route.fulfill({ json: { items } });
    });
    await page.route("**/api/manager/projects/project-1/file?**", (route) => {
      const query = new URL(route.request().url()).searchParams;
      return route.fulfill({
        contentType: "text/plain",
        body: `${query.get("area")}:${query.get("path")}`,
      });
    });
    await page.goto("/tasks/s1");
    const panel = page.locator(".workspace-panel");
    await expect(
      panel.getByRole("button", { name: "uploads", exact: true }),
    ).toHaveCount(0);
    await expect(panel.locator(".file-row")).toHaveText([
      ".work",
      "产物",
      "需求.md1 KB",
      "资料",
    ]);
    await expect(
      panel
        .locator(".file-row.is-hidden-directory")
        .getByRole("button", { name: ".work", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`workspace-tree-${theme}.png`),
    });
    await panel
      .locator("button.file-open")
      .filter({ hasText: /需求.md/ })
      .click();
    await expect(panel.locator(".file-preview:visible")).toContainText(
      "uploads:需求.md",
    );
    await panel.getByRole("tab", { name: "工作空间", exact: true }).click();
    await panel.getByRole("button", { name: "资料", exact: true }).click();
    await expect(panel.locator(".breadcrumb")).toHaveText("工作空间/资料");
    await panel
      .locator("button.file-open")
      .filter({ hasText: /背景.md/ })
      .click();
    await expect(panel.locator(".file-preview:visible")).toContainText(
      "uploads:资料/背景.md",
    );
    await panel.getByRole("tab", { name: "工作空间", exact: true }).click();
    await panel
      .locator(".breadcrumb")
      .getByRole("button", { name: "工作空间", exact: true })
      .click();
    await panel.getByRole("button", { name: ".work", exact: true }).click();
    await expect(panel.locator(".breadcrumb")).toHaveText("工作空间/.work");
    await panel
      .locator("button.file-open")
      .filter({ hasText: /generate.py/ })
      .click();
    await expect(panel.locator(".file-preview:visible")).toContainText(
      "work:generate.py",
    );
    await panel.getByRole("tab", { name: "工作空间", exact: true }).click();
    await panel
      .locator(".breadcrumb")
      .getByRole("button", { name: "工作空间", exact: true })
      .click();
    await panel.locator(".file-row").filter({ hasText: "产物" }).click();
    await panel
      .locator("button.file-open")
      .filter({ hasText: /report.md/ })
      .click();
    await expect(panel.locator(".file-preview:visible")).toContainText(
      "artifacts:report.md",
    );
    await panel.getByRole("tab", { name: "工作空间", exact: true }).click();
    await panel.locator(".list-toolbar input[type=file]").setInputFiles({
      name: "新增资料.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("new"),
    });
    await expect(panel.locator(".breadcrumb")).toHaveText("工作空间");
    await expect(
      panel.locator("button.file-open").filter({ hasText: /新增资料.txt/ }),
    ).toBeVisible();
  });
}
