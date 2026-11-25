import { expect, test, type Page } from "@playwright/test";
import { strToU8, zipSync } from "fflate";

function wordDocument(title: string) {
  const xml = (value: string) => strToU8(value);
  return Buffer.from(
    zipSync({
      "[Content_Types].xml": xml(
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
      ),
      "_rels/.rels": xml(
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="document" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
      ),
      "word/_rels/document.xml.rels": xml(
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="logo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.png"/><Relationship Id="unsafe" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="javascript:window.wordExecuted=true" TargetMode="External"/><Relationship Id="html" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk" Target="chunk.html"/></Relationships>`,
      ),
      "word/styles.xml": xml(
        `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:color w:val="1F4E79"/><w:sz w:val="48"/></w:rPr></w:style></w:styles>`,
      ),
      "word/document.xml":
        xml(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>
      <w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>${title}</w:t></w:r></w:p>
      <w:p><w:r><w:t>正文保留 Word 排版。</w:t></w:r></w:p>
      <w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="8" w:color="1F4E79"/><w:bottom w:val="single" w:sz="8" w:color="1F4E79"/><w:insideH w:val="single" w:sz="8" w:color="1F4E79"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="4680"/><w:gridCol w:w="4680"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:shd w:fill="D9EAF7"/></w:tcPr><w:p><w:r><w:t>业务指标</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>128</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
      <w:p><w:r><w:drawing><wp:inline><wp:extent cx="914400" cy="457200"/><wp:docPr id="1" name="Logo"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="Logo"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="logo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="457200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>
      <w:p><w:hyperlink r:id="unsafe"><w:r><w:t>无效链接</w:t></w:r></w:hyperlink></w:p><w:altChunk r:id="html"/>
      <w:p><w:r><w:br w:type="page"/></w:r></w:p><w:p><w:r><w:t>第二页正文</w:t></w:r></w:p>
      <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
    </w:body></w:document>`),
      "word/media/logo.png": Uint8Array.from(
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAACAAAAAQCAIAAAD4YuoOAAAAHUlEQVR4nGOQ96ukKWIYtWDUglELRi0YtWAoWAAAA77MENas2O4AAAAASUVORK5CYII=",
          "base64",
        ),
      ),
      "word/chunk.html": xml(
        '<script>window.parent.wordExecuted=true</script><img src="https://example.invalid/word-leak">',
      ),
    }),
  );
}

const documents = {
  "排版报告.docx": wordDocument("养老险业务报告"),
  "第二份报告.docx": wordDocument("第二份独立文档"),
};

async function stubDocuments(page: Page) {
  await page.route("**/api/manager/projects/project-1/files**", (route) =>
    route.fulfill({
      json: {
        items: Object.entries(documents).map(([name, body]) => ({
          name,
          path: name,
          is_directory: false,
          size: body.length,
          modified_at: "",
        })),
      },
    }),
  );
  await page.route("**/api/manager/projects/project-1/file?**", (route) => {
    const path = new URL(route.request().url()).searchParams.get("path")!;
    return route.fulfill({
      body: documents[path as keyof typeof documents],
      contentType: "application/octet-stream",
    });
  });
}

test.beforeEach(async ({ page, request }) => {
  await request.post(
    `${process.env.PLAYWRIGHT_API_URL || "http://127.0.0.1:38194"}/__test/reset`,
  );
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
  await stubDocuments(page);
});

test("DOCX preview preserves pages, styles, table cells and embedded images locally", async ({
  page,
}) => {
  const remoteRequests: string[] = [];
  await page.route("https://example.invalid/**", (route) => {
    remoteRequests.push(route.request().url());
    return route.abort();
  });
  await page.goto("/tasks/s1");
  await page
    .locator("button.file-open")
    .filter({ hasText: "排版报告.docx" })
    .click();
  const document = page.locator(".office-document");
  await expect(document).toContainText("养老险业务报告");
  const pages = document.locator("section.docx");
  await expect(pages).toHaveCount(2);
  expect(
    await pages
      .first()
      .evaluate((element) => parseFloat(getComputedStyle(element).width)),
  ).toBeCloseTo(816, 1);
  expect(
    await pages
      .first()
      .evaluate((element) => parseFloat(getComputedStyle(element).minHeight)),
  ).toBeCloseTo(1056, 1);
  expect(
    await pages
      .first()
      .evaluate((element) => parseFloat(getComputedStyle(element).paddingTop)),
  ).toBeCloseTo(96, 1);
  const availableWidth = await page
    .locator(".selection-scroll")
    .evaluate((element) => element.clientWidth);
  await expect
    .poll(async () => Math.ceil((await pages.first().boundingBox())!.width))
    .toBeLessThanOrEqual(availableWidth);
  const heading = document.getByText("养老险业务报告", { exact: true });
  await expect(heading).toHaveCSS("font-size", "32px");
  await expect(heading).toHaveCSS("color", "rgb(31, 78, 121)");
  const cell = document.locator("td").filter({ hasText: "业务指标" });
  await expect(cell).toHaveCSS("background-color", "rgb(217, 234, 247)");
  const image = document.locator("img");
  await expect(image).toHaveCount(1);
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(32);
  await expect(pages.last()).toContainText("第二页正文");
  await expect(document.locator('a[href^="javascript:"]')).toHaveCount(0);
  await expect(document.locator("iframe,script")).toHaveCount(0);
  expect(await page.evaluate(() => "wordExecuted" in window)).toBe(false);
  expect(remoteRequests).toEqual([]);
});

test("Word SVG paints retain colors and local gradients without remote resource attributes", async ({
  page,
}) => {
  await page.goto("/tasks/s1");
  const attributes = await page.evaluate(async () => {
    const { sanitizeWordDocument } =
      await import("/src/components/workspace/wordPreview.ts");
    const container = document.createElement("div");
    container.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg"><path id="remote" fill="url(https://document-resource.invalid/fill)" stroke="url(//document-resource.invalid/stroke)" filter="url(https://document-resource.invalid/filter)"/><path id="local" fill="url(#gradient)" stroke="#123456"/></svg>';
    sanitizeWordDocument(container);
    return {
      remote: ["fill", "stroke", "filter"].map((name) =>
        container.querySelector("#remote")?.getAttribute(name),
      ),
      local: ["fill", "stroke"].map((name) =>
        container.querySelector("#local")?.getAttribute(name),
      ),
    };
  });
  expect(attributes.remote).toEqual([null, null, null]);
  expect(attributes.local).toEqual(["url(#gradient)", "#123456"]);
});

test("switching Word files keeps only the active document and still permits references", async ({
  page,
}) => {
  await page.goto("/tasks/s1");
  const panel = page.locator(".workspace-panel");
  await panel
    .locator("button.file-open")
    .filter({ hasText: "排版报告.docx" })
    .click();
  await expect(panel.locator(".office-document")).toContainText(
    "养老险业务报告",
  );
  await panel.getByRole("tab", { name: "工作空间", exact: true }).click();
  await panel
    .locator("button.file-open")
    .filter({ hasText: "第二份报告.docx" })
    .click();
  const active = panel.getByRole("tabpanel", {
    name: "第二份报告.docx",
    exact: true,
  });
  await expect(active.locator(".office-document")).toContainText(
    "第二份独立文档",
  );
  await expect(active.locator(".office-document")).not.toContainText(
    "养老险业务报告",
  );
  await expect(active.locator("section.docx")).toHaveCount(2);
  await active.getByRole("button", { name: "加入对话", exact: true }).click();
  await expect(page.locator(".composer .preview-reference-card")).toHaveCount(
    1,
  );
  await expect(page.locator(".composer .preview-reference-card")).toContainText(
    "第二份报告.docx",
  );
  await expect
    .poll(() =>
      page
        .locator(".composer .preview-reference-card img")
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(100);
});

test("a Word document hidden while loading fits again when its tab is reopened", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const arrayBuffer = Blob.prototype.arrayBuffer;
    let reads = 0;
    Blob.prototype.arrayBuffer = function () {
      if (this.type === "application/octet-stream" && ++reads === 3) {
        return new Promise<ArrayBuffer>((resolve) => {
          (window as any).releaseWordBuffer = () =>
            arrayBuffer.call(this).then(resolve);
        });
      }
      return arrayBuffer.call(this);
    };
  });
  await page.goto("/tasks/s1");
  const panel = page.locator(".workspace-panel");
  await panel
    .locator("button.file-open")
    .filter({ hasText: "排版报告.docx" })
    .click();
  await expect
    .poll(() => page.evaluate(() => typeof (window as any).releaseWordBuffer))
    .toBe("function");
  await panel.getByRole("tab", { name: "工作空间", exact: true }).click();
  await page.evaluate(() => (window as any).releaseWordBuffer());
  await expect(panel.locator(".office-document")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await panel.getByRole("tab", { name: "排版报告.docx", exact: true }).click();
  const availableWidth = await panel
    .locator(".selection-scroll")
    .evaluate((element) => element.clientWidth);
  const firstPage = panel.locator("section.docx").first();
  await expect
    .poll(async () => Math.ceil((await firstPage.boundingBox())!.width))
    .toBeLessThanOrEqual(availableWidth);
  await expect(panel.locator(".office-document")).toContainText(
    "养老险业务报告",
  );
  await panel.getByRole("button", { name: "加入对话", exact: true }).click();
  await expect(page.locator(".composer .preview-reference-card")).toHaveCount(
    1,
  );
});
