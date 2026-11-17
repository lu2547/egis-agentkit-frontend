import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const limits = {
  maxBytes: 20971520,
  maxEntries: 5000,
  maxEntryBytes: 20971520,
  maxExpandedBytes: 104857600,
  maxSlides: 200,
  maxTitleChars: 120,
  thumbnailWidth: 144,
  maxThumbnailPixels: 65536,
  thumbnailConcurrency: 2,
};
async function openDeck(page: Page, holdRefresh = false) {
  let releaseRefresh: (() => void) | undefined;
  const held = new Promise<void>((resolve) => (releaseRefresh = resolve));
  let initialPreview = true;
  let content = readFileSync("tests/fixtures/preview.pptx");
  let slides = [
    { id: "256", title: "Preview slide 1" },
    { id: "257", title: "Preview slide 2" },
  ];
  const checksum = () => createHash("sha256").update(content).digest("hex");
  const operations: any[] = [];
  let fail = false,
    counter = 257;
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
  await page.route("**/api/manager/projects/project-1/files**", (r) =>
    r.fulfill({
      json: {
        items: [
          {
            name: "preview.pptx",
            path: "preview.pptx",
            size: content.length,
            is_directory: false,
          },
        ],
      },
    }),
  );
  await page.route("**/api/manager/projects/project-1/file?**", (r) =>
    r.fulfill({ body: content, contentType: "application/octet-stream" }),
  );
  await page.route("**/api/manager/projects/project-1/presentation?**", (r) =>
    r.fulfill({ json: { checksum: checksum(), slides, options: limits } }),
  );
  await page.route(
    "**/api/manager/projects/project-1/preview?**",
    async (r) => {
      const requestedPage = new URL(r.request().url()).searchParams.get("page");
      const bytes = readFileSync(
        `tests/fixtures/${slides.length === 2 ? "preview.pdf" : `presentation-${slides.length}.pdf`}`,
      );
      const first = initialPreview;
      initialPreview = false;
      if (holdRefresh && !first && !requestedPage) await held;
      if (requestedPage) {
        const { PDFDocument } = await import("pdf-lib");
        const original = await PDFDocument.load(bytes),
          output = await PDFDocument.create();
        output.addPage(
          (await output.copyPages(original, [Number(requestedPage) - 1]))[0]!,
        );
        return r.fulfill({
          body: Buffer.from(await output.save()),
          contentType: "application/pdf",
        });
      }
      return r.fulfill({ body: bytes, contentType: "application/pdf" });
    },
  );
  await page.route(
    "**/api/manager/projects/project-1/presentation/slides?**",
    (r) => {
      const body = r.request().postDataJSON();
      operations.push(body);
      if (fail || r.request().headers()["if-match"] !== `"${checksum()}"`)
        return r.fulfill({
          status: 409,
          json: { detail: "演示文稿已更新，请重新打开后再操作" },
        });
      const index = slides.findIndex((s) => s.id === body.slide_id);
      let active = body.slide_id;
      if (
        body.operation_type === "add" ||
        body.operation_type === "duplicate"
      ) {
        active = String(++counter);
        const copy = {
          id: active,
          title: body.operation_type === "add" ? "" : slides[index]!.title,
        };
        slides.splice(
          body.target_index ? body.target_index - 1 : index + 1,
          0,
          copy,
        );
      } else if (body.operation_type === "remove") {
        slides.splice(index, 1);
        active = slides[Math.min(index, slides.length - 1)]!.id;
      } else if (body.operation_type === "move") {
        const [item] = slides.splice(index, 1);
        slides.splice(body.target_index - 1, 0, item!);
      }
      content = Buffer.from("revision-" + counter + "-" + operations.length);
      return r.fulfill({
        json: { checksum: checksum(), slides, active_slide_id: active },
      });
    },
  );
  await page.goto("/tasks/s1");
  await page
    .locator("button.file-open")
    .filter({ hasText: "preview.pptx" })
    .click();
  await expect(page.locator(".pdf-pages")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  return {
    operations,
    releaseRefresh: () => releaseRefresh?.(),
    failNext: () => {
      fail = true;
    },
  };
}
test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
});

test("PPT pages form one continuous scroll and directory follows the visible page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1500, height: 600 });
  await openDeck(page);
  const sheets = page.locator(".presentation-sheet");
  await expect(sheets).toHaveCount(2);
  const first = sheets.nth(0),
    second = sheets.nth(1);
  await expect(first.locator("canvas")).toHaveAttribute(
    "data-rendered",
    "true",
  );
  await expect(second.locator("canvas")).toHaveAttribute(
    "data-rendered",
    "true",
  );
  const a = await first.boundingBox(),
    b = await second.boundingBox();
  expect(b!.y).toBeGreaterThanOrEqual(a!.y + a!.height);
  const stream = page.locator(".pdf-pages");
  await stream.hover();
  await page.mouse.wheel(0, b!.y - a!.y);
  await expect(page.getByLabel("PDF 翻页和缩放")).toContainText("2 / 2");
  await expect(
    page.getByRole("button", { name: "第 2 页：Preview slide 2", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page
    .getByRole("button", { name: "第 1 页：Preview slide 1", exact: true })
    .click();
  await expect(page.getByLabel("PDF 翻页和缩放")).toContainText("1 / 2");
  await expect
    .poll(async () =>
      Math.abs(
        (await first.boundingBox())!.y - (await stream.boundingBox())!.y,
      ),
    )
    .toBeLessThan(2);
  await expect(sheets).toHaveCount(2);
});

test("continuous PPT retains each page's frame and quotes only that page", async ({
  page,
}) => {
  await openDeck(page);
  const sheet = (n: number) => page.locator(".presentation-sheet").nth(n - 1);
  for (const n of [1, 2]) {
    await page
      .getByRole("button", {
        name: `第 ${n} 页：Preview slide ${n}`,
        exact: true,
      })
      .click();
    await sheet(n).getByRole("button", { name: "框选", exact: true }).click();
    const b = await sheet(n).getByLabel("文件框选区域").boundingBox();
    await page.mouse.move(b!.x + b!.width * 0.15, b!.y + b!.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(b!.x + b!.width * 0.7, b!.y + b!.height * 0.5, {
      steps: 5,
    });
    await page.mouse.up();
    await sheet(n).getByLabel("区域 1 备注").fill(`仅第${n}页`);
  }
  await expect(sheet(1).locator(".selection-region")).toHaveCount(1);
  await expect(sheet(2).locator(".selection-region")).toHaveCount(1);
  await sheet(2).getByRole("button", { name: "加入对话", exact: true }).click();
  await expect(page.locator(".composer .preview-reference-card")).toContainText(
    "第 2 / 2 页",
  );
  await expect(sheet(2).locator(".selection-region")).toHaveCount(0);
  await page
    .getByRole("button", { name: "第 1 页：Preview slide 1", exact: true })
    .click();
  await expect(sheet(1).getByLabel("区域 1 备注")).toHaveValue("仅第1页");
});

test("directory load failure can be retried without reopening the conversation", async ({
  page,
}) => {
  await openDeck(page);
  let fail = true;
  await page.route("**/api/manager/projects/project-1/presentation?**", (r) =>
    fail
      ? r.fulfill({ status: 404, json: { detail: "Not Found" } })
      : r.fallback(),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("暂时无法加载页面目录");
  fail = false;
  await page.getByRole("button", { name: "重新加载目录", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "幻灯片目录" }),
  ).toBeVisible();
});

test("PPT directory has real thumbnails, page navigation and collapse", async ({
  page,
}) => {
  await openDeck(page);
  const directory = page.getByRole("navigation", { name: "幻灯片目录" });
  await expect(
    directory.getByRole("button", { name: "第 2 页：Preview slide 2" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      directory
        .locator("canvas")
        .first()
        .evaluate((c: HTMLCanvasElement) => c.width),
    )
    .toBeGreaterThan(50);
  await directory
    .getByRole("button", { name: "第 2 页：Preview slide 2" })
    .click();
  await expect(page.getByLabel("PDF 翻页和缩放")).toContainText("2 / 2");
  await page.getByRole("button", { name: "收起目录", exact: true }).click();
  await expect(directory).toHaveCount(0);
  await page.getByRole("button", { name: "展开目录", exact: true }).click();
  await expect(directory).toBeVisible();
});

test("new slide writes after current slide, refreshes preview and remains after reload", async ({
  page,
}) => {
  const { operations } = await openDeck(page);
  await page.getByRole("button", { name: "新建幻灯片", exact: true }).click();
  await expect(page.getByLabel("PDF 翻页和缩放")).toContainText("2 / 3");
  expect(operations[0]).toMatchObject({
    operation_type: "add",
    slide_id: "256",
  });
  await expect(
    page
      .getByRole("navigation", { name: "幻灯片目录" })
      .locator(".presentation-page"),
  ).toHaveCount(3);
  await page.reload();
  await expect(
    page
      .getByRole("navigation", { name: "幻灯片目录" })
      .locator(".presentation-page"),
  ).toHaveCount(3);
});

test("stale slide operation shows error and retains the previous deck", async ({
  page,
}) => {
  const { failNext } = await openDeck(page);
  failNext();
  await page.getByRole("button", { name: "新建幻灯片", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("演示文稿已更新");
  await expect(page.getByLabel("PDF 翻页和缩放")).toContainText("1 / 2");
});

test("PPT page menu copies, pastes, reorders and removes slides", async ({
  page,
}) => {
  const { operations } = await openDeck(page);
  const directory = page.getByRole("navigation", { name: "幻灯片目录" });
  await directory
    .getByRole("button", { name: "第 1 页操作", exact: true })
    .click();
  await directory.getByRole("menuitem", { name: "复制", exact: true }).click();
  await directory
    .getByRole("button", { name: "第 2 页操作", exact: true })
    .click();
  await directory.getByRole("menuitem", { name: "粘贴", exact: true }).click();
  await expect(page.getByLabel("PDF 翻页和缩放")).toContainText("3 / 3");
  await directory
    .getByRole("button", { name: "第 3 页操作", exact: true })
    .click();
  await directory
    .getByRole("menuitem", { name: "向上移动", exact: true })
    .click();
  await expect(page.getByLabel("PDF 翻页和缩放")).toContainText("2 / 3");
  await directory
    .getByRole("button", { name: "第 2 页操作", exact: true })
    .click();
  await directory.getByRole("menuitem", { name: "删除", exact: true }).click();
  await expect(page.getByLabel("PDF 翻页和缩放")).toContainText("2 / 2");
  expect(operations.map((item) => item.operation_type)).toEqual([
    "duplicate",
    "move",
    "remove",
  ]);
});

test("saved page changes remain usable while a full preview refresh is waiting", async ({
  page,
}) => {
  const deck = await openDeck(page, true);
  try {
    await page.getByRole("button", { name: "新建幻灯片", exact: true }).click();
    await expect(page.locator(".presentation-sheet")).toHaveCount(3);
    await expect(
      page.getByRole("button", { name: "新建幻灯片", exact: true }),
    ).toBeEnabled();
    await expect(page.locator(".presentation-actions")).toContainText("已保存");
    await expect(page.locator(".presentation-refresh")).toHaveCount(0);
    await expect(
      page.locator(".presentation-sheet").first().locator("canvas"),
    ).toHaveAttribute("data-rendered", "true");
  } finally {
    deck.releaseRefresh();
  }
  await expect(page.locator(".presentation-actions")).not.toContainText(
    "预览更新中",
  );
});

test("PPT preview loads metadata and PDF without first downloading the PPTX", async ({
  page,
}) => {
  const reads: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/file"))
      reads.push(request.url());
  });
  await openDeck(page);
  expect(reads).toEqual([]);
});

test("consecutive saved edits do not wait for the previous full render or restore stale pages", async ({
  page,
}) => {
  const deck = await openDeck(page, true);
  try {
    await page.getByRole("button", { name: "新建幻灯片", exact: true }).click();
    await expect(page.locator(".presentation-sheet")).toHaveCount(3);
    await expect(
      page.getByRole("button", { name: "新建幻灯片", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "新建幻灯片", exact: true }).click();
    await expect(page.locator(".presentation-sheet")).toHaveCount(4);
    await expect(
      page.getByRole("button", { name: "新建幻灯片", exact: true }),
    ).toBeEnabled();
    expect(deck.operations).toHaveLength(2);
  } finally {
    deck.releaseRefresh();
  }
  await expect(page.locator(".presentation-actions")).not.toContainText(
    "预览更新中",
  );
  await expect(page.locator(".presentation-sheet")).toHaveCount(4);
});

test("an externally overwritten PPT reloads its page directory and rendered pages", async ({
  page,
}) => {
  await openDeck(page);
  await expect(
    page.getByRole("button", { name: "第 1 页：Preview slide 1", exact: true }),
  ).toBeVisible();
  await page.route(
    "**/api/manager/projects/project-1/presentation?**",
    (route) =>
      route.fulfill({
        json: {
          checksum: "b".repeat(64),
          slides: [
            { id: "300", title: "Updated first slide" },
            { id: "301", title: "Updated second slide" },
            { id: "302", title: "Added third slide" },
          ],
          options: limits,
        },
      }),
  );
  await page.route("**/api/manager/projects/project-1/preview?**", (route) =>
    route.fulfill({
      body: readFileSync("tests/fixtures/presentation-3.pdf"),
      contentType: "application/pdf",
    }),
  );
  await page.getByRole("button", { name: "刷新文件", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "第 1 页：Updated first slide",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".presentation-sheet")).toHaveCount(3);
  await expect(page.getByLabel("PDF 翻页和缩放")).toContainText("1 / 3");
});
