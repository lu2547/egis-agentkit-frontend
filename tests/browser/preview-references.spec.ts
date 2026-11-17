import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
const options = {
  maxCount: 4,
  maxTotalBytes: 1048576,
  maxImageBytes: 262144,
  maxImagePixels: 1500000,
  maxImageEdge: 1600,
  maxRegions: 8,
  minRegionPixels: 5,
  maxExcerptChars: 8000,
  maxNoteChars: 500,
  captureTimeoutMs: 15000,
  jpegQuality: 0.85,
  jpegMinQuality: 0.25,
  jpegQualityStep: 0.15,
};
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="white"/><text x="40" y="80" font-size="36">SVG preview test</text><script>window.parent.svgExecuted=true</script></svg>';
async function openPreview(
  page: any,
  name: string,
  body: Buffer | string,
  mime: string,
  target = "/tasks/s1",
) {
  await page.route("**/api/manager/projects/project-1/files**", (r: any) =>
    r.fulfill({
      json: {
        items: [
          { name, path: name, is_directory: false, size: 100, modified_at: "" },
        ],
      },
    }),
  );
  await page.route("**/api/manager/projects/project-1/file?**", (r: any) =>
    r.fulfill({ body, contentType: mime }),
  );
  await page.route("**/api/manager/projects/project-1/preview?**", (r: any) =>
    r.fulfill({
      body: readFileSync("tests/fixtures/preview.pdf"),
      contentType: "application/pdf",
    }),
  );
  await page.route(
    "**/api/manager/projects/project-1/preview-options",
    (r: any) => r.fulfill({ json: options }),
  );
  await page.goto(target);
  await page.locator("button.file-open").filter({ hasText: name }).click();
}
async function draw(page: any) {
  await page.getByRole("button", { name: "框选", exact: true }).click();
  const activeSheet = page.locator(".presentation-sheet.is-current");
  const scope = (await activeSheet.count()) ? activeSheet : page;
  const layer = scope.getByLabel("文件框选区域");
  const b = await layer.boundingBox();
  await page.mouse.move(b.x + b.width * 0.15, b.y + b.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.7, b.y + b.height * 0.5, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(page.locator(".selection-region")).toHaveCount(1);
  await scope.getByLabel("区域 1 备注").fill("调整这里");
}
test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
});

for (const target of ["/tasks/s1", "/projects/project-1"]) {
  test(`preview notes can be sent without body text from ${target}`, async ({
    page,
  }) => {
    await openPreview(page, "chart.svg", svg, "image/svg+xml", target);
    await draw(page);
    await page.getByRole("button", { name: "加入对话", exact: true }).click();
    await expect(page.locator(".composer textarea")).toHaveValue("");
    let sent: any;
    await page.route("**/api/chat/", async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({ json: { status: "accepted" } });
    });
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect
      .poll(() => sent?.input?.content?.[0]?.text)
      .toContain("调整这里");
    expect(sent.input.metadata.preview_references[0].regions[0].note).toBe(
      "调整这里",
    );
    await expect(page.locator(".composer .preview-reference-card")).toHaveCount(
      0,
    );
  });
}

test("PDF region reference excludes the heading and diagrams outside the frame", async ({
  page,
}) => {
  await openPreview(
    page,
    "scoped.pdf",
    readFileSync("tests/fixtures/scoped.pdf"),
    "application/pdf",
  );
  await expect(page.locator(".pdf-pages")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await draw(page);
  await page.getByRole("button", { name: "加入对话", exact: true }).click();
  await expect(page.locator(".composer .preview-reference-card")).toHaveCount(
    1,
  );
  let sent: any;
  await page.route("**/api/chat/", async (r) => {
    sent = r.request().postDataJSON();
    await r.fulfill({ json: { status: "accepted" } });
  });
  await page.locator(".composer textarea").fill("优化这句话，其他保持不变");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect
    .poll(() => sent?.input?.content?.[0]?.text)
    .toContain("Selected body paragraph");
  expect(sent.input.content[0].text).not.toContain("Outside title");
  expect(sent.input.content[0].text).not.toContain("Unselected chart");
});

test("HTML region reference excludes outside headings as well", async ({
  page,
}) => {
  await openPreview(
    page,
    "scoped.html",
    '<html><body style="margin:0;height:600px"><h1 style="position:absolute;left:40px;top:20px">Outside heading</h1><p style="position:absolute;left:100px;top:180px">Selected DOM paragraph</p><p style="position:absolute;left:40px;top:500px">Outside footer</p></body></html>',
    "text/html",
  );
  await expect(page.locator(".html-preview")).toBeVisible();
  await draw(page);

  await page.getByRole("button", { name: "加入对话", exact: true }).click();
  await expect(page.locator(".composer .preview-reference-card")).toHaveCount(
    1,
  );
  let sent: any;
  await page.route("**/api/chat/", async (r) => {
    sent = r.request().postDataJSON();
    await r.fulfill({ json: { status: "accepted" } });
  });
  await page.locator(".composer textarea").fill("只改框内正文");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect
    .poll(() => sent?.input?.content?.[0]?.text)
    .toContain("Selected DOM paragraph");
  expect(sent.input.content[0].text).not.toContain("Outside heading");
  expect(sent.input.content[0].text).not.toContain("Outside footer");
});
for (const mime of [
  "image/svg+xml",
  "text/plain",
  "application/octet-stream",
]) {
  test(`SVG is an image and can be quoted (${mime})`, async ({ page }) => {
    await openPreview(page, "chart.svg", svg, mime);
    const image = page.locator(".file-preview .preview-image");
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((e: HTMLImageElement) => e.naturalWidth))
      .toBe(800);
    expect(await page.evaluate(() => "svgExecuted" in window)).toBe(false);
    await draw(page);
    await page.getByRole("button", { name: "加入对话", exact: true }).click();
    await expect(page.locator(".composer .preview-reference-card")).toHaveCount(
      1,
    );
    await expect(
      page.locator(".composer .preview-reference-card img"),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "移除引用 chart.svg · 第 1 / 1 页" })
      .click();
    await expect(page.locator(".composer .preview-reference-card")).toHaveCount(
      0,
    );
  });
}
test("PPT page reference reaches native message and returns to its page", async ({
  page,
}) => {
  await openPreview(
    page,
    "deck.pptx",
    "pptx input",
    "application/octet-stream",
  );
  await expect(page.locator(".pdf-pages")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "PDF 翻页和缩放" }),
  ).toContainText("2 / 2");
  await expect(page.locator(".pdf-pages")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await draw(page);
  await page.getByRole("button", { name: "加入对话", exact: true }).click();
  await expect(page.locator(".composer .preview-reference-card")).toContainText(
    "第 2 / 2 页",
  );
  let sent: any;
  await page.route("**/api/chat/", async (r) => {
    sent = r.request().postDataJSON();
    await r.fulfill({ json: { status: "accepted" } });
  });
  await page.locator(".composer textarea").fill("调整这一页");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect
    .poll(() => sent?.input?.metadata?.preview_references?.[0]?.page)
    .toBe(2);
  expect(
    sent.input.content.some(
      (b: any) => b.type === "data" && b.source.type === "base64",
    ),
  ).toBe(true);
  expect(sent.input.metadata.preview_references[0].regions[0].note).toBe(
    "调整这里",
  );
  await expect(page.locator(".composer .preview-reference-card")).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "上一页", exact: true }).click();
  await page.locator(".user-message .preview-reference-card").click();
  await expect(
    page.getByRole("navigation", { name: "PDF 翻页和缩放" }),
  ).toContainText("2 / 2");
  await expect(page.locator(".selection-region")).toHaveCount(1);
  await page.route("**/api/sessions/s1/messages?**", (r) =>
    r.fulfill({
      json: {
        messages: [sent.input],
        event_cursor: null,
        is_running: false,
        has_more: false,
      },
    }),
  );
  await page.reload();
  await expect(
    page.locator(".user-message .preview-reference-card"),
  ).toContainText("第 2 / 2 页");
  await page.locator(".user-message .preview-reference-card").click();
  await expect(
    page.getByRole("navigation", { name: "PDF 翻页和缩放" }),
  ).toContainText("2 / 2");
});
for (const name of ["report.html", "report.md", "report.txt", "report.docx"]) {
  test(`${name} uses the common rectangle reference without running document scripts`, async ({
    page,
  }) => {
    const body = name.endsWith(".docx")
      ? readFileSync("tests/fixtures/preview.docx")
      : name.endsWith(".html")
        ? '<html><body style="padding:20px"><h1>可引用的报告</h1><p>文件预览正文</p><script>window.parent.htmlExecuted=true</script><img src="https://example.invalid/private-leak" onerror="window.parent.htmlExecuted=true" /></body></html>'
        : "# 可引用的报告\n\n文件预览正文";
    let external = false;
    await page.route("https://example.invalid/**", (r) => {
      external = true;
      return r.abort();
    });
    await openPreview(
      page,
      name,
      body,
      name.endsWith(".html") ? "text/html" : "application/octet-stream",
    );
    await expect(
      page.getByRole("button", { name: "框选", exact: true }),
    ).toBeVisible();
    if (name.endsWith(".html"))
      await expect(
        page.frameLocator("iframe").getByText("可引用的报告"),
      ).toBeVisible();
    await draw(page);
    await page.getByRole("button", { name: "加入对话", exact: true }).click();
    await expect(page.locator(".composer .preview-reference-card")).toHaveCount(
      1,
    );
    const card = page.locator(".composer .preview-reference-card img");
    await expect
      .poll(() => card.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(100);
    expect(await page.evaluate(() => "htmlExecuted" in window)).toBe(false);
    expect(external).toBe(false);
  });
}
test("failed send keeps the reference and switching conversations clears it", async ({
  page,
}) => {
  await openPreview(page, "chart.svg", svg, "image/svg+xml");
  await draw(page);
  await page.getByRole("button", { name: "加入对话", exact: true }).click();
  await page.route("**/api/chat/", (r) =>
    r.fulfill({ status: 500, json: { detail: "fixture send failed" } }),
  );
  await page.locator(".composer textarea").fill("继续分析");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.locator(".composer .preview-reference-card")).toHaveCount(
    1,
  );
  await expect(
    page.getByText("fixture send failed", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "新建任务", exact: true })
    .first()
    .click();
  await expect(page.locator(".composer .preview-reference-card")).toHaveCount(
    0,
  );
});
test("changed source is displayed with a warning instead of restoring obsolete rectangles", async ({
  page,
}) => {
  await openPreview(page, "chart.svg", svg, "image/svg+xml");
  await draw(page);
  await page.getByRole("button", { name: "加入对话", exact: true }).click();
  await page.getByRole("button", { name: "文件", exact: true }).click();
  await page.route("**/api/manager/projects/project-1/file?**", (r) =>
    r.fulfill({
      body: svg.replace("SVG preview test", "Changed source"),
      contentType: "image/svg+xml",
    }),
  );
  await page.locator(".composer .preview-reference-card").click();
  await expect(
    page.getByRole("alert").filter({ hasText: "源文件已更新" }),
  ).toBeVisible();
  await expect(page.locator(".selection-region")).toHaveCount(0);
});

test("rejected references preserve the selection and notes for retry", async ({
  page,
}) => {
  await openPreview(page, "chart.svg", svg, "image/svg+xml");
  // The draft fetched the server limit before this route is changed; use its actual four-page limit.
  for (let i = 0; i < 4; i++)
    await page.getByRole("button", { name: "加入对话", exact: true }).click();
  await expect(page.locator(".composer .preview-reference-card")).toHaveCount(
    4,
  );
  await draw(page);
  await page.getByRole("button", { name: "加入对话", exact: true }).click();
  await expect(page.locator(".composer").getByRole("alert")).toContainText(
    "最多",
  );
  await expect(page.locator(".selection-region")).toHaveCount(1);
  await expect(page.getByLabel("区域 1 备注")).toHaveValue("调整这里");
});
test("wide HTML shares the document width with the selection coordinate system", async ({
  page,
}) => {
  await openPreview(
    page,
    "wide.html",
    '<html><body><div style="width:2000px;height:300px">宽版面测试</div></body></html>',
    "text/html",
  );
  await expect(
    page.frameLocator("iframe").getByText("宽版面测试"),
  ).toBeVisible();
  const contentWidth = await page
    .frameLocator("iframe")
    .locator("html")
    .evaluate((e) => e.scrollWidth);
  await expect
    .poll(() =>
      page
        .getByLabel("文件框选区域")
        .evaluate((e) => e.getBoundingClientRect().width),
    )
    .toBe(contentWidth);
});
test("Delete inside a note edits text without removing its rectangle", async ({
  page,
}) => {
  await openPreview(page, "chart.svg", svg, "image/svg+xml");
  await draw(page);
  await page.getByLabel("区域 1 备注").press("Delete");
  await expect(page.locator(".selection-region")).toHaveCount(1);
  await expect(page.getByLabel("区域 1 备注")).toHaveValue("调整这里");
});
