import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
});

test("switching conversations during upload never sends or clears the next conversation draft", async ({
  page,
}) => {
  let uploadStarted!: () => void, releaseUpload!: () => void;
  const started = new Promise<void>((resolve) => (uploadStarted = resolve));
  const released = new Promise<void>((resolve) => (releaseUpload = resolve));
  await page.route(
    "**/api/manager/projects/project-1/files**",
    async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      uploadStarted();
      await released;
      await route.fulfill({
        json: { name: "a.txt", path: "a.txt", is_directory: false, size: 1 },
      });
    },
  );
  await page.route("**/api/manager/tasks", (route) =>
    route.fulfill({
      json: {
        items: [
          { session_id: "s1", name: "整理行业研究与行动建议", agent_id: "a1" },
          { session_id: "s2", name: "另一个对话", agent_id: "a2" },
        ],
      },
    }),
  );
  await page.route("**/api/manager/tasks/s2", (route) =>
    route.fulfill({
      json: {
        session_id: "s2",
        agent_id: "a2",
        name: "另一个对话",
        definition_id: "personal",
        definition_display_name: "个人助理",
      },
    }),
  );
  const sent: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/chat/")) sent.push(request.postData() || "");
  });
  await page.goto("/tasks/s1");
  await expect(
    page.getByPlaceholder("今天帮你做些什么？@ 添加上下文，/调用技能与指令。"),
  ).toBeEditable();
  await page.locator('.composer input[type="file"]').setInputFiles({
    name: "a.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("a"),
  });
  await page
    .getByPlaceholder("今天帮你做些什么？@ 添加上下文，/调用技能与指令。")
    .fill("旧对话的附件消息");
  await started;
  await page.locator('.sidebar a[href="/tasks/s2"]').click();
  await expect(page.locator(".task-header h1")).toHaveText("另一个对话");
  const input = page.getByPlaceholder(
    "今天帮你做些什么？@ 添加上下文，/调用技能与指令。",
  );
  await input.fill("新对话未发送的草稿");
  releaseUpload();
  await expect(
    page.getByRole("button", { name: "发送消息", exact: true }),
  ).toBeEnabled();
  await expect(input).toHaveValue("新对话未发送的草稿");
  expect(sent).toEqual([]);
});

test("a superseded open does not consume a queued draft", async ({ page }) => {
  let loading!: () => void, release!: () => void;
  const started = new Promise<void>((resolve) => (loading = resolve));
  const gate = new Promise<void>((resolve) => (release = resolve));
  let blockSlow = true;
  await page.route("**/api/manager/tasks", async (route) => {
    if (route.request().method() === "POST")
      return route.fulfill({
        json: {
          session_id: "slow",
          agent_id: "slow-agent",
          name: "慢对话",
          definition_id: "personal",
        },
      });
    return route.fulfill({
      json: {
        items: [
          { session_id: "s1", name: "整理行业研究与行动建议", agent_id: "a1" },
          { session_id: "slow", name: "慢对话", agent_id: "slow-agent" },
        ],
      },
    });
  });
  await page.route("**/api/manager/tasks/slow", async (route) => {
    if (blockSlow) {
      loading();
      await gate;
    }
    await route
      .fulfill({
        json: {
          session_id: "slow",
          agent_id: "slow-agent",
          name: "慢对话",
          definition_id: "personal",
        },
      })
      .catch(() => {});
  });
  const sent: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/chat/")) sent.push(request.postData() || "");
  });
  await page.goto("/");
  await page.locator(".composer textarea").fill("只属于旧对话的草稿");
  await page.getByRole("button", { name: "发送消息" }).click();
  await started;
  await page.locator('.sidebar a[href="/tasks/s1"]').click();
  await expect(page.locator(".task-header h1")).toHaveText(
    "整理行业研究与行动建议",
  );
  blockSlow = false;
  release();
  expect(sent).toEqual([]);
  await page.locator('.sidebar a[href="/tasks/slow"]').click();
  await expect
    .poll(() => sent.some((body) => body.includes("只属于旧对话的草稿")))
    .toBe(true);
});
