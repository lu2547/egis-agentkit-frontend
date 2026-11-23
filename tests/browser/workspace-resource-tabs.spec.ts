import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
  await page.route("**/api/manager/projects/project-1/files?**", (route) => {
    const area = new URL(route.request().url()).searchParams.get("area");
    return route.fulfill({
      json: {
        items: [
          {
            name: area === "artifacts" ? "交付报告.md" : "项目说明.txt",
            path: area === "artifacts" ? "交付报告.md" : "项目说明.txt",
            size: 20,
            is_directory: false,
          },
        ],
      },
    });
  });
  await page.route("**/api/manager/projects/project-1/file?**", (route) =>
    route.fulfill({
      contentType: "text/plain",
      body:
        "文件内容：" + new URL(route.request().url()).searchParams.get("path"),
    }),
  );
});

test("a restored entry page reloads its artifacts and opens one directly", async ({
  page,
}) => {
  await page.goto("/tasks/s1");
  const panel = page.locator(".workspace-panel");
  await panel.getByRole("button", { name: "新标签页", exact: true }).click();
  await expect(panel.locator(".workspace-start-artifacts")).toContainText(
    "交付报告.md",
  );
  await page.reload();
  await expect(panel.locator(".workspace-start-artifacts")).toContainText(
    "交付报告.md",
  );
  await panel
    .locator(".workspace-start-artifacts")
    .getByRole("button", { name: "交付报告.md", exact: true })
    .click();
  await expect(
    panel.getByRole("tab", { name: "交付报告.md", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    panel.getByRole("tab", { name: "新标签页", exact: true }),
  ).toHaveCount(0);
});

for (const theme of ["light", "dark"]) {
  test(`${theme} new tab opens workspace, changes, artifacts and files in one strip`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript(
      (value) => localStorage.setItem("pension-gpt-theme", value),
      theme,
    );
    await page.goto("/tasks/s1");
    const panel = page.locator(".workspace-panel");
    const tabs = panel.getByRole("tablist", { name: "工作区标签" });
    await expect(
      tabs.getByRole("tab", { name: "工作空间", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await panel.getByRole("button", { name: "新标签页", exact: true }).click();
    await expect(
      panel.getByRole("button", { name: "查看工作空间", exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "查看变更", exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "查看产物", exact: true }),
    ).toBeVisible();
    await expect(panel.locator(".workspace-start-artifacts")).toContainText(
      "交付报告.md",
    );
    await page.screenshot({
      path: testInfo.outputPath(`workspace-start-${theme}.png`),
    });
    await panel.getByRole("button", { name: "查看变更", exact: true }).click();
    await expect(
      tabs.getByRole("tab", { name: "变更", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      tabs.getByRole("tab", { name: "新标签页", exact: true }),
    ).toHaveCount(0);
    await panel.getByRole("button", { name: "新标签页", exact: true }).click();
    await panel.getByRole("button", { name: "查看产物", exact: true }).click();
    await expect(
      tabs.getByRole("tab", { name: "产物", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await panel
      .locator(".file-open")
      .filter({ hasText: "交付报告.md" })
      .click();
    await expect(
      tabs.getByRole("tab", { name: "交付报告.md", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(panel.locator(".file-preview:visible")).toContainText(
      "文件内容：交付报告.md",
    );
    await tabs.getByRole("tab", { name: "工作空间", exact: true }).click();
    await panel
      .locator(".file-open")
      .filter({ hasText: "项目说明.txt" })
      .click();
    await expect(tabs.getByRole("tab")).toHaveCount(5);
    await page.reload();
    await expect(tabs.getByRole("tab")).toHaveCount(5);
    await expect(
      tabs.getByRole("tab", { name: "项目说明.txt", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await panel
      .getByRole("button", { name: "放大工作区", exact: true })
      .click();
    await expect(panel).toHaveClass(/is-expanded/);
    await expect(panel.locator(".file-preview:visible")).toContainText(
      "项目说明.txt",
    );
    await panel
      .getByRole("button", { name: "还原工作区", exact: true })
      .click();
    await panel
      .getByRole("button", { name: "关闭标签 项目说明.txt", exact: true })
      .click();
    await expect(
      tabs.getByRole("tab", { name: "交付报告.md", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
  });
}
