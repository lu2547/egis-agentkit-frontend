import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
});

test("session @ focuses the searchable panel, offers experts and project files, and restores composer focus", async ({
  page,
}) => {
  await page.goto("/tasks/s1");
  const input = page.locator(".composer textarea");
  await input.fill("@");
  const search = page.getByRole("textbox", { name: "搜索项目文件" });
  await expect(search).toBeFocused();
  await search.fill("行动计划");
  await expect(page.getByRole("option", { name: /行动计划.md/ })).toBeVisible();
  await search.press("Enter");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("");
  const file = page.getByRole("button", { name: "定位引用 行动计划.md" });
  await expect(file).toBeVisible();
  await file.click();
  await expect(page.getByRole("tab", { name: "行动计划.md" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "发送消息", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".context-picker")).toHaveCount(0);
});

test("slash searches installed skills in its focused input and Escape does not send", async ({
  page,
}) => {
  await page.goto("/");
  const input = page.locator(".composer textarea");
  await input.fill("/");
  const search = page.getByRole("textbox", { name: "搜索已安装技能" });
  await expect(search).toBeFocused();
  await search.fill("找不到");
  await search.press("Enter");
  await expect(page).toHaveURL("/");
  await search.press("Escape");
  await expect(input).toBeFocused();
  await expect(page.locator(".context-picker")).toHaveCount(0);
});

test("file mentions display a removable chip and deliver the exact project path", async ({
  page,
  request: api,
}) => {
  const filename = "report_20261107_223808-a964f31821cf.pdf";
  const reference = `artifacts/scratch/${filename}`;
  await page.route("**/api/manager/composer/options?**", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: "upload",
            name: "源文件.docx",
            detail: "源文件.docx",
            kind: "file",
            reference: "源文件.docx",
          },
          {
            id: "report",
            name: filename,
            display_name: "年金分析报告.pdf",
            detail: reference,
            kind: "file",
            reference,
          },
        ],
        next_cursor: null,
      },
    }),
  );
  await page.goto("/tasks/s1");
  const input = page.locator(".composer textarea");
  await input.fill("请分析 @");
  const upload = page.getByRole("option", { name: /源文件\.docx/ });
  await expect(upload.getByText("源文件.docx", { exact: true })).toHaveCount(1);
  await upload.click();
  await expect(input).toHaveValue("请分析 ");
  const remove = page.getByRole("button", { name: "移除引用 源文件.docx" });
  await remove.click();
  await expect(remove).toHaveCount(0);
  await input.fill("请分析 @");
  const option = page.getByRole("option", { name: /年金分析报告\.pdf/ });
  await expect(option).toBeVisible();
  await expect(option).toContainText(reference);
  await option.click();
  await expect(input).toHaveValue("请分析 ");
  await expect(
    page.getByRole("button", { name: "移除引用 年金分析报告.pdf" }),
  ).toBeVisible();

  const request = page.waitForRequest(
    (request) =>
      request.url().endsWith("/chat/") && request.method() === "POST",
  );
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  const message = (await request).postDataJSON().input;
  expect(message.content[0].text).toContain(`【项目文件：${reference}】`);
  expect(message.content[0].text).not.toContain("源文件.docx");
  await expect(page.locator(".user-message").last()).toContainText("请分析");
  await expect(page.locator(".user-message").last()).toContainText(
    "年金分析报告.pdf",
  );
  await expect(page.locator(".user-message").last()).not.toContainText(
    filename,
  );
  await expect(
    page.getByRole("heading", { name: "已完成研究简报" }),
  ).toBeVisible();
  const savedHistory = await api.post("http://127.0.0.1:38194/__test/messages", {
    data: { session_id: "s1", messages: [message] },
  });
  expect(savedHistory.ok()).toBe(true);
  await page.reload();
  await expect(page.locator(".user-message").last()).toContainText(
    "年金分析报告.pdf",
  );
});

test("old deliveries remain with their original reply and do not follow a new reply", async ({
  page,
}) => {
  await page.goto("/tasks/s1");
  const input = page.locator(".composer textarea");
  await input.fill("交付报告");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.locator(".message-entry .artifact-card")).toHaveCount(2);
  await input.fill("解释一下");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.locator(".assistant-message")).toHaveCount(2);
  const replies = page
    .locator(".message-entry")
    .filter({ has: page.locator(".assistant-message") });
  await expect(replies.first().locator(".artifact-card")).toHaveCount(2);
  await expect(replies.last().locator(".artifact-card")).toHaveCount(0);
});

test("history search empty state uses only its search illustration", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "全局搜索", exact: true }).click();
  await expect(page.locator(".search-empty")).toBeVisible();
  await expect(page.locator(".search-empty img")).toHaveCount(0);
});
