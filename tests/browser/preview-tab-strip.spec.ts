import { expect, test, type Page } from "@playwright/test";

const api = "http://127.0.0.1:38194";
const names = [
  "RAG_LLM-Wiki_协同架构与企业知识中心说明.md",
  "平安泰康_体量差距对比与业务分析.pptx",
  "平安泰康_体量差距对比数据.xlsx",
  "项目补充资料_业务需求说明.md",
  "项目补充资料_接口设计文档.md",
  "项目补充资料_验收清单.txt",
  "项目补充资料_迭代计划.txt",
  "项目补充资料_风险评估.txt",
];
async function openTabs(page: Page, files: string[]) {
  await page.addInitScript((paths) => {
    sessionStorage.setItem("egis_access_token", "test-only");
    const scopeId = "project:project-1:session:s1";
    sessionStorage.setItem(
      `egis_workspace_preview:demo:${scopeId}`,
      JSON.stringify({
        active: `${scopeId}:uploads:${paths[0]}`,
        items: paths.map((path) => ({ scopeId, area: "uploads", path })),
      }),
    );
  }, files);
  await page.route("**/api/manager/projects/project-1/file?**", (route) =>
    route.fulfill({ contentType: "text/plain", body: "Preview tab test" }),
  );
  await page.goto("/tasks/s1");
  await expect(
    page.getByRole("tablist", { name: "文件预览标签" }),
  ).toBeVisible();
}

test.beforeEach(async ({ request }) => {
  await request.post(`${api}/__test/reset`);
});

for (const theme of ["light", "dark"]) {
  test(`${theme} preview tabs shrink with the panel while retaining icons and ellipsized names`, async ({
    page,
  }) => {
    await page.addInitScript(
      (value) => localStorage.setItem("pension-gpt-theme", value),
      theme,
    );
    await openTabs(page, names.slice(0, 3));
    const panel = page.locator(".workspace-panel");
    const resize = panel.getByRole("separator", { name: "调整工作区宽度" });
    const first = panel.locator(".preview-file-tab").first();
    const wide = (await first.boundingBox())!.width;
    await resize.focus();
    for (let i = 0; i < 4; i++) await resize.press("ArrowRight");
    await expect
      .poll(async () => (await first.boundingBox())!.width)
      .toBeLessThan(wide - 10);
    const layout = await panel
      .locator(".preview-file-tabs")
      .evaluate((element) => {
        const tabs = [
          ...element.querySelectorAll<HTMLElement>(".preview-file-tab"),
        ];
        return {
          width: element.clientWidth,
          scrollWidth: element.scrollWidth,
          tabs: tabs.map((tab) => {
            const text = tab.querySelector("span")!;
            const icon = tab.querySelector("img")!.getBoundingClientRect();
            const close = tab
              .querySelector(".preview-tab-close")!
              .getBoundingClientRect();
            return {
              width: tab.getBoundingClientRect().width,
              textWidth: text.clientWidth,
              textScroll: text.scrollWidth,
              iconWidth: icon.width,
              iconHeight: icon.height,
              closeWidth: close.width,
            };
          }),
        };
      });
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width + 1);
    for (const tab of layout.tabs) {
      expect(tab.width).toBeGreaterThan(70);
      expect(tab.iconWidth).toBeGreaterThanOrEqual(14);
      expect(tab.iconWidth).toBeLessThanOrEqual(18);
      expect(tab.iconHeight).toBe(tab.iconWidth);
      expect(tab.textScroll).toBeGreaterThan(tab.textWidth);
      expect(tab.closeWidth).toBeGreaterThan(16);
    }
  });
}

test("wheel over a file tab scrolls overflow horizontally without scrolling the document or changing selection", async ({
  page,
}) => {
  await openTabs(page, names);
  const strip = page.getByRole("tablist", { name: "文件预览标签" });
  await expect
    .poll(() =>
      strip.evaluate((element) => element.scrollWidth - element.clientWidth),
    )
    .toBeGreaterThan(0);
  const before = await page
    .locator(".file-preview")
    .evaluate((element) => element.scrollTop);
  await page.getByRole("tab", { name: names[0], exact: true }).hover();
  await page.mouse.wheel(0, 200);
  await expect
    .poll(() => strip.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(30);
  const styles = await strip.evaluate((element) => ({
    scrollbar: getComputedStyle(element).scrollbarWidth,
    webkit: getComputedStyle(element, "::-webkit-scrollbar").display,
  }));
  expect(styles.scrollbar === "none" || styles.webkit === "none").toBe(true);
  await expect(
    page.getByRole("tab", { name: names[0], exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  expect(
    await page
      .locator(".file-preview")
      .evaluate((element) => element.scrollTop),
  ).toBe(before);
  await strip.hover();
  await page.mouse.wheel(100, 0);
  await expect
    .poll(() => strip.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(200);
  await page.mouse.wheel(0, -1000);
  await expect
    .poll(() => strip.evaluate((element) => element.scrollLeft))
    .toBe(0);
  const first = page.getByRole("tab", { name: names[0], exact: true });
  await first.focus();
  await first.press("End");
  const last = page.getByRole("tab", { name: names.at(-1), exact: true });
  await expect(last).toBeFocused();
  await expect(last).toHaveAttribute("aria-selected", "true");
  const bounds = await strip.boundingBox();
  const active = await last.boundingBox();
  expect(active!.x).toBeGreaterThanOrEqual(bounds!.x - 1);
  expect(active!.x + active!.width).toBeLessThanOrEqual(
    bounds!.x + bounds!.width + 1,
  );
});
