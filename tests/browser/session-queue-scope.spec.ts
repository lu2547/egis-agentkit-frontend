import { expect, test } from "@playwright/test";

test("switching conversations keeps each queue request bound to its own agent", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await request.post("http://127.0.0.1:38194/manager/tasks", {
    headers: { Authorization: "Bearer test-only" },
    data: {
      definition_id: "expert-0",
      resource_view_type: "system",
      resource_version: "1",
      project_id: "project-1",
    },
  });
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
  // 真实会话各有独立 Agent；通用浏览器夹具默认复用 a1，这里还原这个边界。
  await page.route("**/api/manager/tasks/s2", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: { ...(await response.json()), agent_id: "a2" },
    });
  });
  const invalid: { sid: string | null; aid: string | null }[] = [];
  const valid = new Set<string>();
  await page.route(/\/api\/chat\/queue\?/, async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const sid = params.get("session_id"),
      aid = params.get("agent_id");
    if (aid !== (sid === "s1" ? "a1" : "a2")) {
      invalid.push({ sid, aid });
      await route.fulfill({
        status: 403,
        json: { detail: "会话不存在或不可访问" },
      });
    } else {
      valid.add(sid!);
      await route.continue();
    }
  });
  await page.goto("/tasks/s1");
  await expect.poll(() => valid.has("s1")).toBe(true);
  await page.locator('a[href="/tasks/s2"]').click();
  await expect(page.locator(".task-header h1")).toHaveText("新的工作任务");
  await expect.poll(() => valid.has("s2")).toBe(true);
  expect(invalid, "队列请求不能串用新会话和旧 Agent 的标识").toEqual([]);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.locator(".composer textarea").fill("企业年金缴费要核对哪些材料？");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.locator(".assistant-message")).toContainText(
    "已完成研究简报",
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
});
