import { test, expect } from "@playwright/test";

async function openChat(
  page: import("@playwright/test").Page,
  request: import("@playwright/test").APIRequestContext,
) {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
  await page.goto("/tasks/s1");
}

test("shows preparation before REPLY_START and switches to one real assistant reply", async ({
  page,
  request,
}) => {
  await openChat(page, request);
  let release!: () => void;
  const preparing = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/chat/", async (route) => {
    await preparing;
    await route.continue();
  });
  await page.locator(".composer textarea").fill("长任务：准备执行任务");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  try {
    await expect(page.locator(".assistant-preparing")).toContainText("准备中");
    await expect(page.locator(".assistant-message")).toHaveCount(1);
  } finally {
    release();
  }
  await expect(page.locator(".assistant-preparing")).toHaveCount(0);
  await expect(page.locator(".assistant-message")).toHaveCount(1);
  await expect(page.locator(".latest-activity")).toContainText("正在思考");
});

test("removes preparation when sending fails and retains the user's draft", async ({
  page,
  request,
}) => {
  await openChat(page, request);
  await page.route("**/api/chat/", (route) =>
    route.fulfill({ status: 503, json: { detail: "请求未接受" } }),
  );
  await page.locator(".composer textarea").fill("准备执行任务");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("请求未接受");
  await expect(page.locator(".assistant-preparing")).toHaveCount(0);
  await expect(page.locator(".composer textarea")).toHaveValue("准备执行任务");
});
