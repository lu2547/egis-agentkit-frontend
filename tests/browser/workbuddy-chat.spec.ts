import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
});

test("runtime controls live in the composer and search opens in the conversation", async ({
  page,
}) => {
  await page.goto("/tasks/s1");
  const composer = page.locator(".composer");
  await expect(composer.getByLabel("权限模式")).toBeVisible();
  await expect(composer.getByLabel("模型")).toBeVisible();
  await expect(page.locator(".task-header").getByLabel("权限模式")).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "对话内搜索" }).click();
  await expect(page.getByLabel("搜索当前对话")).toBeFocused();
});

test("expert context picker offers real usable definitions", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".composer textarea").fill("@");
  await expect(page.getByRole("listbox", { name: "添加上下文" })).toBeVisible();
});

test("assistant uses the new icon and the Chinese display name", async ({
  page,
}) => {
  await page.goto("/tasks/s1");
  await page.locator(".composer textarea").fill("验证中文名称");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.locator(".assistant-label span").first()).toHaveText(
    "研究分析专家",
  );
  await expect(page.locator(".assistant-mark").first()).toHaveAttribute(
    "src",
    "/brand/assistant-icon.png",
  );
});
