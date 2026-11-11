import { test, expect } from "@playwright/test";
for (const theme of ["light", "dark"] as const) {
  test(`${theme} format icons match in delivery cards, workspace, preview and uploads`, async ({
    page,
    request,
  }, testInfo) => {
    await request.post("http://127.0.0.1:38194/__test/reset");
    await page.addInitScript((value) => {
      sessionStorage.setItem("egis_access_token", "test-only");
      localStorage.setItem("pension-gpt-theme", value);
    }, theme);
    const files = [
      "报告.docx",
      "readme.md",
      "solution.py",
      "slides.pptx",
      "records.xlsx",
      "index.html",
    ];
    await page.route(
      "**/api/manager/projects/project-1/files?**",
      async (route) => {
        if (route.request().method() === "POST") return route.continue();
        const area = new URL(route.request().url()).searchParams.get("area");
        await route.fulfill({
          json: {
            items:
              area === "artifacts"
                ? files.map((name) => ({
                    name,
                    path: name,
                    size: 2048,
                    area: "artifacts",
                    is_directory: false,
                    modified_at: "",
                  }))
                : [],
          },
        });
      },
    );
    await page.route("**/api/manager/projects/project-1/file?**", (route) =>
      route.fulfill({
        contentType: "text/markdown",
        body: "# 彩色格式图标预览",
      }),
    );
    await page.route("**/api/manager/tasks/s1/artifacts", async (route) => {
      const response = await route.fetch();
      const original = await response.json();
      const reply_id = original.items[0]?.reply_id;
      return route.fulfill({
        json: {
          items: reply_id
            ? files.map((name) => ({
                name,
                path: name,
                size: 2048,
                area: "artifacts",
                is_directory: false,
                modified_at: "",
                reply_id,
              }))
            : [],
        },
      });
    });
    await page.goto("/tasks/s1");
    await page.locator(".composer textarea").fill("生成多种格式的交付文件");
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect(page.locator(".artifact-card .file-type-icon")).toHaveCount(6);
    const panel = page.locator(".workspace-panel");
    await panel
      .getByRole("navigation", { name: "工作空间面板" })
      .getByRole("button", { name: "产物", exact: true })
      .click();
    for (const type of [
      "word",
      "markdown",
      "python",
      "powerpoint",
      "excel",
      "html",
    ]) {
      const card = page.locator(`.artifact-card img[data-file-type="${type}"]`);
      const row = panel.locator(`.file-row img[data-file-type="${type}"]`);
      await expect(card).toHaveAttribute("src", `/file-icons/${type}.svg`);
      await expect(row).toHaveAttribute("src", `/file-icons/${type}.svg`);
      await expect(card).toHaveAttribute("width", "44");
      await expect(row).toHaveAttribute("width", "26");
      await expect
        .poll(() => row.evaluate((el) => (el as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
    }
    await page.screenshot({
      path: testInfo.outputPath(`file-icons-${theme}.png`),
    });
    await panel.locator("button.file-open").filter({ hasText: /readme.md/ }).click();
    await expect(panel.locator(".file-preview header img")).toHaveAttribute(
      "src",
      "/file-icons/markdown.svg",
    );
    await expect(
      panel.getByRole("heading", { name: "彩色格式图标预览" }),
    ).toBeVisible();
    await page.locator('.composer input[type="file"]').setInputFiles({
      name: "Main.java",
      mimeType: "text/plain",
      buffer: Buffer.from("class Main {}"),
    });
    await expect(page.locator(".attachments img")).toHaveAttribute(
      "src",
      "/file-icons/java.svg",
    );
  });
}
