import { test, expect } from "@playwright/test";
import { AssistantMsg, UserMsg } from "@agentscope-ai/agentscope/message";
const user = UserMsg({ name: "user", content: "请分析集团差异" });
const reply = AssistantMsg({ name: "analyst", content: "已核实的第一轮回答" });
reply.id = "action-reply";
reply.finished_at = new Date().toISOString();
const later = AssistantMsg({
  name: "analyst",
  content: "后续回答不能进入分支",
});
later.finished_at = new Date().toISOString();

test("reply actions copy, persist feedback visible to admins, and branch from the selected reply", async ({
  page,
  request,
  context,
}) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
  await request.post("http://127.0.0.1:38194/__test/messages", {
    data: { session_id: "s1", messages: [user, reply, later] },
  });
  await page.goto("/tasks/s1");
  const entry = page.locator('[data-message-id="action-reply"]');
  await entry.getByRole("button", { name: "复制回答", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "已核实的第一轮回答",
  );
  await expect(entry.getByRole("status")).toContainText("已复制");
  await entry.getByRole("button", { name: "吐槽回答", exact: true }).click();
  const form = page.getByRole("dialog", { name: "吐槽这条回答" });
  await form.getByLabel("具体问题").fill("数据口径不一致，请核对来源");
  const saved = page.waitForResponse(
    (r) =>
      r.url().includes("/replies/action-reply/feedback") &&
      r.request().method() === "PUT",
  );
  await form.getByRole("button", { name: "提交反馈", exact: true }).click();
  expect((await saved).ok()).toBe(true);
  await expect(entry.getByRole("status")).toContainText(
    "提交成功，感谢您的反馈",
  );
  await expect(
    entry.getByRole("button", { name: "吐槽回答", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    entry.getByRole("button", { name: "吐槽回答", exact: true }),
  ).toHaveCSS("color", "rgb(183, 73, 66)");
  await page.reload();
  await expect(
    entry.getByRole("button", { name: "吐槽回答", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    entry.getByRole("button", { name: "吐槽回答", exact: true }),
  ).toHaveCSS("color", "rgb(183, 73, 66)");
  await page.goto("/admin/reply-feedback");
  await expect(page.getByRole("heading", { name: "回复反馈" })).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "数据口径不一致，请核对来源", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "查看详情", exact: true }).click();
  const detail = page.getByRole("dialog", { name: "反馈详情" });
  await expect(detail).toContainText("请分析集团差异");
  await expect(detail).toContainText("已核实的第一轮回答");
  await detail.getByRole("button", { name: "关闭", exact: true }).click();
  await page.goto("/tasks/s1");
  await entry
    .getByRole("button", { name: "更多回复操作", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "分支到新聊天", exact: true })
    .click();
  await expect(page).toHaveURL(/\/tasks\/s2$/);
  await expect(page.locator(".message-list")).toContainText(
    "已核实的第一轮回答",
  );
  await expect(page.locator(".message-list")).not.toContainText(
    "后续回答不能进入分支",
  );
  await page.reload();
  await expect(page.locator(".message-list")).toContainText("请分析集团差异");
  await page.screenshot({ path: "/tmp/agentkit-message-actions-verified.png" });
});

test("failed feedback and branching retain the comment and current conversation", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
  await request.post("http://127.0.0.1:38194/__test/messages", {
    data: { session_id: "s1", messages: [user, reply] },
  });
  await page.route(
    "**/api/manager/tasks/s1/replies/action-reply/feedback",
    (r) => r.fulfill({ status: 503, json: { detail: "反馈暂时不可用" } }),
  );
  await page.route("**/api/manager/tasks/s1/replies/action-reply/branch", (r) =>
    r.fulfill({ status: 409, json: { detail: "对话正在运行" } }),
  );
  await page.goto("/tasks/s1");
  const entry = page.locator('[data-message-id="action-reply"]');
  await entry.getByRole("button", { name: "吐槽回答", exact: true }).click();
  const form = page.getByRole("dialog", { name: "吐槽这条回答" });
  await form.getByLabel("具体问题").fill("保存失败时保留");
  await form.getByRole("button", { name: "提交反馈", exact: true }).click();
  await expect(form.getByRole("alert")).toHaveText("反馈暂时不可用");
  await expect(form.getByLabel("具体问题")).toHaveValue("保存失败时保留");
  await form.getByRole("button", { name: "取消", exact: true }).click();
  await entry
    .getByRole("button", { name: "更多回复操作", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "分支到新聊天", exact: true })
    .click();
  await expect(entry.getByRole("alert")).toContainText("对话正在运行");
  await expect(page).toHaveURL(/\/tasks\/s1$/);
});
