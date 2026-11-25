import { readFileSync } from "node:fs";
import { expect, test, type Locator } from "@playwright/test";

const api = process.env.ATTACHMENT_TEST_API_URL || "http://127.0.0.1:38194";
const wordBytes = Array.from(readFileSync("tests/fixtures/preview.docx"));
const pngBytes = Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRz8AAAAASUVORK5CYII=",
    "base64",
  ),
);
type TransferFile = { name: string; type: string; bytes: number[] };
const word: TransferFile = {
  name: "会议资料.docx",
  type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  bytes: wordBytes,
};
const screenshot: TransferFile = {
  name: "截图.png",
  type: "image/png",
  bytes: pngBytes,
};

async function transfer(
  target: Locator,
  event: "paste" | "drop" | "dragover",
  files: TransferFile[],
  options: { text?: string; itemsOnly?: boolean } = {},
) {
  return target.evaluate(
    (element, input) => {
      const data = new DataTransfer();
      if (input.options.text) data.setData("text/plain", input.options.text);
      for (const file of input.files)
        data.items.add(
          new File([new Uint8Array(file.bytes)], file.name, {
            type: file.type,
          }),
        );
      if (input.options.itemsOnly)
        Object.defineProperty(data, "files", {
          value: new DataTransfer().files,
        });
      const event =
        input.event === "paste"
          ? new ClipboardEvent("paste", {
              clipboardData: data,
              bubbles: true,
              cancelable: true,
            })
          : new DragEvent(input.event, {
              dataTransfer: data,
              bubbles: true,
              cancelable: true,
            });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    },
    { event, files, options },
  );
}

test.beforeEach(async ({ page, request }) => {
  await request.post(`${api}/__test/reset`);
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
});

test("pastes a Word file and screenshot through selection uploads without sending or changing the draft", async ({
  page,
  request,
}) => {
  const sends: unknown[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/chat/"))
      sends.push(request.postDataJSON());
  });
  await page.goto("/tasks/s1");
  const input = page.locator(".composer > .t-textarea textarea");
  await input.fill("保留这段草稿");
  expect(await transfer(input, "paste", [word])).toBe(true);
  await expect(page.locator(".composer .attachments")).toContainText(word.name);
  await expect(
    page.getByRole("button", { name: "添加资源", exact: true }),
  ).toBeEnabled();
  await input.dispatchEvent("compositionstart");
  expect(await transfer(input, "paste", [screenshot])).toBe(true);
  await input.dispatchEvent("compositionend");
  await expect(page.locator(".composer .attachments > span > span")).toHaveText(
    [word.name, screenshot.name],
  );
  await expect(
    page.getByRole("button", { name: "添加资源", exact: true }),
  ).toBeEnabled();
  await expect(input).toHaveValue("保留这段草稿");
  expect(sends).toHaveLength(0);
  for (const file of [word, screenshot]) {
    const response = await request.get(
      `${api}/manager/projects/project-1/file?area=uploads&path=${encodeURIComponent(file.name)}`,
      { headers: { Authorization: "Bearer test-only" } },
    );
    expect(Array.from(await response.body())).toEqual(file.bytes);
  }
  const sent = page.waitForRequest((request) =>
    request.url().endsWith("/api/chat/"),
  );
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  const payload = (await sent).postDataJSON();
  expect(payload.input.content[0].text).toContain(
    "- 会议资料.docx\n- 截图.png",
  );
  await expect(page.locator(".composer .attachments")).toHaveCount(0);
});

test("accepts clipboard file items mixed with text and leaves plain text paste and text drags alone", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const input = page.locator(".composer > .t-textarea textarea");
  await input.fill("草稿");
  expect(
    await transfer(input, "paste", [word], {
      itemsOnly: true,
      text: "带文件的文字",
    }),
  ).toBe(false);
  await expect(page.locator(".composer .attachments")).toContainText(word.name);
  expect(await transfer(input, "paste", [], { text: "普通文字" })).toBe(false);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => navigator.clipboard.writeText("普通文字"));
  await input.focus();
  await input.press("End");
  await input.press("Meta+V");
  await expect(input).toHaveValue("草稿普通文字");
  for (const event of ["dragover", "drop"] as const)
    expect(
      await transfer(page.locator(".composer"), event, [], {
        text: "队列或文字拖动",
      }),
    ).toBe(false);
  await expect(page.locator(".composer .attachments > span")).toHaveCount(1);
});

test("drops multiple arbitrary files in order without duplicates or uploads before a new conversation is sent", async ({
  page,
}) => {
  const uploads: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/files?"))
      uploads.push(request.url());
  });
  await page.goto("/");
  const files = [
    word,
    { name: "原始数据.bin", type: "", bytes: [0, 1, 2, 255] },
    screenshot,
  ];
  const composer = page.locator(".composer");
  expect(await transfer(composer, "dragover", files)).toBe(true);
  expect(await transfer(composer, "drop", files)).toBe(true);
  await expect(composer.locator(".attachments > span > span")).toHaveText([
    "会议资料.docx",
    "原始数据.bin",
    "截图.png",
  ]);
  expect(uploads).toHaveLength(0);
  await expect(page).toHaveURL("/");
  await composer.locator("textarea").fill("阅读拖入的文件");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page).toHaveURL("/tasks/s2");
  expect(uploads).toHaveLength(3);
});

test("blocks paste, drop and file selection during an attachment upload while preventing file navigation", async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    "**/api/manager/projects/project-1/files?**",
    async (route) => {
      if (route.request().method() === "POST") await held;
      await route.continue();
    },
  );
  await page.goto("/tasks/s1");
  const composer = page.locator(".composer");
  const input = composer.locator("textarea");
  await input.fill("尚未发送");
  await composer.locator('input[type="file"]').setInputFiles({
    name: "正在上传.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("pending"),
  });
  try {
    await expect(
      page.getByRole("button", { name: "添加资源", exact: true }),
    ).toBeDisabled();
    await expect(composer.locator('input[type="file"]')).toBeDisabled();
    expect(await transfer(input, "paste", [word])).toBe(true);
    expect(await transfer(composer, "drop", [screenshot])).toBe(true);
    await expect(composer.locator(".attachments > span > span")).toHaveText([
      "正在上传.txt",
    ]);
    await expect(input).toHaveValue("尚未发送");
  } finally {
    release();
  }
  await expect(
    page.getByRole("button", { name: "添加资源", exact: true }),
  ).toBeEnabled();
});

test("allows Add file, paste, drop and removal while a reply accepts queued guidance", async ({
  page,
}) => {
  await page.goto("/tasks/s1");
  const composer = page.locator(".composer");
  const input = composer.locator(":scope > .t-textarea textarea");
  await input.fill("长任务：处理材料");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "加入引导队列", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "添加资源", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "添加资源", exact: true }).click();
  await page.getByRole("menuitem", { name: "添加文件", exact: true }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "从本地上传", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "从菜单.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("menu"),
  });
  await expect(
    page.getByRole("button", { name: "移除 从菜单.txt", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "移除 从菜单.txt", exact: true })
    .click();
  expect(await transfer(input, "paste", [word])).toBe(true);
  await expect(
    page.getByRole("button", { name: "添加资源", exact: true }),
  ).toBeEnabled();
  expect(await transfer(composer, "drop", [screenshot])).toBe(true);
  await expect(
    page.getByRole("button", { name: "添加资源", exact: true }),
  ).toBeEnabled();
  await input.fill("参考补充资料");
  await page.getByRole("button", { name: "加入引导队列", exact: true }).click();
  await expect(page.locator(".steering-queue-row")).toContainText(
    "会议资料.docx",
  );
  await expect(page.locator(".steering-queue-row")).toContainText("截图.png");
  await expect(composer.locator(".attachments")).toHaveCount(0);
});

test("rejects file input when a running reply has no steering support", async ({
  page,
}) => {
  await page.route("**/api/manager/runtime-options", async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    delete json.steering;
    await route.fulfill({ response, json });
  });
  await page.goto("/tasks/s1");
  const composer = page.locator(".composer");
  await composer.locator("textarea").fill("长任务：无引导支持");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "停止生成", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "添加资源", exact: true }),
  ).toBeDisabled();
  expect(await transfer(composer.locator("textarea"), "paste", [word])).toBe(
    true,
  );
  expect(await transfer(composer, "drop", [screenshot])).toBe(true);
  await expect(composer.locator(".attachments")).toHaveCount(0);
  await expect(page).toHaveURL("/tasks/s1");
});
