import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";

const digest = (value: Buffer) =>
  createHash("sha256").update(value).digest("hex");
async function openEditor(page: Page, expectReady = true) {
  let content = readFileSync("tests/fixtures/editor.xlsx");
  const saves: Buffer[] = [];
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
  await page.route("**/api/manager/projects/project-1/files**", (r) =>
    r.fulfill({
      json: {
        items: [
          {
            name: "editor.xlsx",
            path: "editor.xlsx",
            is_directory: false,
            size: content.length,
          },
        ],
      },
    }),
  );
  await page.route("**/api/manager/projects/project-1/file?**", async (r) => {
    if (r.request().method() === "PUT") {
      if (r.request().headers()["if-match"] !== `"${digest(content)}"`)
        return r.fulfill({
          status: 409,
          json: { detail: "文件已被更新，请重新打开" },
        });
      content = r.request().postDataBuffer()!;
      saves.push(content);
      return r.fulfill({
        json: {
          checksum: digest(content),
          path: "editor.xlsx",
          area: "uploads",
        },
      });
    }
    return r.fulfill({
      body: content,
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  });
  await page.goto("/tasks/s1");
  await page
    .locator("button.file-open")
    .filter({ hasText: "editor.xlsx" })
    .click();
  const editor = page.getByRole("region", { name: "Excel 编辑器" });
  if (!expectReady)
    return {
      editor,
      saves,
      replace: () => {
        content = Buffer.from("external update");
      },
    };
  await expect(
    editor.getByRole("button", { name: "保存", exact: true }),
  ).toBeEnabled({ timeout: 30000 });
  await editor.getByRole("button", { name: "宽屏编辑" }).click();
  await editor.getByLabel("选择工作表").selectOption("财务");
  return {
    editor,
    saves,
    replace: () => {
      content = Buffer.from("external update");
    },
  };
}
async function selectRange(page: Page, address: string) {
  const box = page.locator(".gc-name-box-container input");
  await box.fill(address);
  await box.press("Enter");
  await expect(page.locator(".spreadsheet-selection")).toContainText(address);
}

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
});

test("configured archive expansion limit rejects XLSX before native import", async ({
  page,
}) => {
  await page.route("**/api/manager/projects/project-1/workbook-options", (r) =>
    r.fulfill({
      json: {
        maxBytes: 20971520,
        maxReferenceCells: 2000,
        maxEntries: 1000,
        maxEntryBytes: 20971520,
        maxExpandedBytes: 1,
      },
    }),
  );
  await openEditor(page, false);
  await expect(page.getByRole("alert")).toContainText("无法安全预览");
  await expect(page.locator(".gc-designer")).toHaveCount(0);
});

test("native cell context menu retains editing actions and adds conversation reference", async ({
  page,
}) => {
  const { editor } = await openEditor(page);
  await selectRange(page, "B2:C3");
  await editor
    .locator('canvas[gcuielement="gcWorksheetCanvas"]')
    .click({ button: "right", position: { x: 250, y: 50 } });
  for (const label of [
    "剪切",
    "复制",
    "清除内容",
    "筛选",
    "排序",
    "编辑批注",
    "删除批注",
    "显示/隐藏批注",
    "格式化批注...",
  ])
    await expect(editor.getByText(label, { exact: true }).last()).toBeVisible();
  await expect(editor.getByText("吐槽赢研值", { exact: true })).toHaveCount(0);
  await editor.getByText("加入对话", { exact: true }).last().click();
  await editor.getByRole("button", { name: "退出宽屏" }).click();
  await expect(page.locator(".composer .preview-reference-card")).toContainText(
    "财务 · B2:C3",
  );
  let sent: any;
  await page.route("**/api/chat/", async (r) => {
    sent = r.request().postDataJSON();
    await r.fulfill({ json: { status: "accepted" } });
  });
  await page.locator(".composer textarea").fill("检查公式结果");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect.poll(() => sent?.input?.content?.[0]?.text).toContain("C2=300");
});

test("native worksheet rename marks dirty and survives save", async ({
  page,
}) => {
  const { editor } = await openEditor(page);
  await editor.getByLabel("选择工作表").selectOption("明细");
  await editor.getByRole("button", { name: "保存", exact: true }).click();
  await expect(editor.getByRole("status")).toHaveText("已保存到项目");
  await editor
    .locator('canvas[id$="_tabStrip"]')
    .dblclick({ position: { x: 140, y: 14 } });
  const rename = editor.locator(".gc-sheetTabEditor");
  await expect(rename).toHaveValue("明细");
  await rename.fill("明细更新");
  await rename.press("Enter");
  await expect(editor.getByRole("status")).toHaveText("未保存");
  await editor.getByRole("button", { name: "保存", exact: true }).click();
  await expect(editor.getByRole("status")).toHaveText("已保存到项目");
  await page.reload();
  await expect(
    editor
      .getByLabel("选择工作表")
      .getByRole("option", { name: "明细更新", exact: true }),
  ).toHaveCount(1, { timeout: 30000 });
});

test("native Excel edit/save preserves formulas, merged cells and comments; selected range reaches chat", async ({
  page,
}) => {
  const { editor, saves } = await openEditor(page);
  await selectRange(page, "B2");
  await page.keyboard.type("250");
  await page.keyboard.press("Enter");
  await expect(editor.getByRole("status")).toHaveText("未保存");
  await editor.getByRole("button", { name: "保存", exact: true }).click();
  await expect(editor.getByRole("status")).toHaveText("已保存到项目");
  expect(saves).toHaveLength(1);
  const parts = unzipSync(saves[0]);
  const xml = Object.entries(parts)
    .filter(([name]) => /^xl\/worksheets\/sheet\d+.xml$/.test(name))
    .map(([, data]) => strFromU8(data))
    .join("\n");
  expect(xml).toContain("SUM(B2:B3)");
  expect(xml).toContain('ref="A5:C5"');
  expect(xml).toContain("250");
  expect(Object.keys(parts).some((name) => /comments.*xml$/.test(name))).toBe(
    true,
  );
  await page.reload();
  await expect(
    editor.getByRole("button", { name: "保存", exact: true }),
  ).toBeEnabled({ timeout: 30000 });
  await editor.getByRole("button", { name: "宽屏编辑" }).click();
  await editor.getByLabel("选择工作表").selectOption("财务");
  await selectRange(page, "B2:C3");
  await editor.getByRole("button", { name: "加入对话", exact: true }).click();
  await expect(editor.getByRole("alert")).toHaveCount(0);
  await editor.getByRole("button", { name: "退出宽屏" }).click();
  const card = page.locator(".composer .preview-reference-card");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("财务 · B2:C3");
  await expect(card.locator("img")).toBeVisible();
  expect(
    await card.locator("img").evaluate((image: HTMLImageElement) => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      let ink = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (pixels[i]! < 240 || pixels[i + 1]! < 240 || pixels[i + 2]! < 240)
          ink++;
      return ink;
    }),
  ).toBeGreaterThan(50);
  await selectRange(page, "A1");
  await card.getByRole("button", { name: /定位引用/ }).click();
  await expect(editor.locator(".spreadsheet-selection")).toContainText("B2:C3");
  let sent: any;
  await page.route("**/api/chat/", async (r) => {
    sent = r.request().postDataJSON();
    await r.fulfill({ json: { status: "accepted" } });
  });
  await page.locator(".composer textarea").fill("检查这部分的公式");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect
    .poll(
      () =>
        sent?.input?.metadata?.preview_references?.[0]?.spreadsheet?.sheetName,
    )
    .toBe("财务");
  expect(sent.input.content[0].text).toContain("C2=450");
  expect(sent.input.content[0].text).toContain("SUM(B2:B3)");
});

test("stale save keeps edits and leaving dirty workbook asks before discarding", async ({
  page,
}) => {
  const { editor, saves, replace } = await openEditor(page);
  await selectRange(page, "B2");
  await page.keyboard.type("999");
  await page.keyboard.press("Enter");
  replace();
  await editor.getByRole("button", { name: "保存", exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText("文件已被更新");
  expect(saves).toHaveLength(0);
  await expect(editor.getByRole("status")).toHaveText("未保存");
  await editor.getByRole("button", { name: "退出宽屏" }).click();
  await page
    .locator(".workspace-tab-strip")
    .getByRole("tab", { name: "工作空间", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  await page
    .locator(".workspace-tab-strip")
    .getByRole("tab", { name: "editor.xlsx", exact: true })
    .click();
  await expect(editor.getByRole("status")).toHaveText("未保存");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "关闭标签 editor.xlsx", exact: true })
    .click();
  await expect(editor).toBeVisible();
});

test("switching file tabs preserves unsaved native Excel edits", async ({
  page,
}) => {
  const { editor, saves } = await openEditor(page);
  await selectRange(page, "B2");
  await page.keyboard.type("999");
  await page.keyboard.press("Enter");
  await editor.getByRole("button", { name: "退出宽屏" }).click();
  await page.getByRole("button", { name: "刷新文件", exact: true }).click();
  await expect(editor.getByRole("status")).toHaveText("未保存");
  await page.route("**/api/manager/projects/project-1/files**", (r) =>
    r.fulfill({
      json: {
        items: [
          { name: "note.txt", path: "note.txt", size: 10, is_directory: false },
        ],
      },
    }),
  );
  await page.route("**/api/manager/projects/project-1/file?**", (r) =>
    new URL(r.request().url()).searchParams.get("path") === "note.txt"
      ? r.fulfill({ contentType: "text/plain", body: "another file" })
      : r.fallback(),
  );
  await page
    .locator(".workspace-tab-strip")
    .getByRole("tab", { name: "工作空间", exact: true })
    .click();
  await page
    .locator("button.file-open")
    .filter({ hasText: "note.txt" })
    .click();
  await expect(page.locator(".file-preview:visible .text-preview")).toHaveText(
    "another file",
  );
  await page.getByRole("tab", { name: "editor.xlsx", exact: true }).click();
  await expect(editor.getByRole("status")).toHaveText("未保存");
  await editor.getByRole("button", { name: "保存", exact: true }).click();
  await expect.poll(() => saves.length).toBe(1);
  const zip = unzipSync(new Uint8Array(saves[0]!));
  const sheets = Object.entries(zip)
    .filter(([name]) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .map(([, data]) => strFromU8(data))
    .join("\n");
  expect(sheets).toMatch(/r="B2"[^>]*>.*?<v>999<\/v>/s);
});
