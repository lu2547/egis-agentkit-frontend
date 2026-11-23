import { test, expect, type Page } from "@playwright/test";
const api = process.env.AGENTKIT_TEST_API_URL || "http://127.0.0.1:38194";
test.beforeEach(async ({ page, request }) => {
  await request.post(api + "/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
});
async function personal(page: Page) {
  await page.route("**/api/manager/tasks/s1", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      json: {
        ...(await response.json()),
        definition_id: "personal",
        definition_display_name: "个人助理",
        collaboration_allowed: true,
        collaborators: [],
      },
    });
  });
  await page.route("**/api/manager/composer/options?**", async (route) => {
    if (
      new URL(route.request().url()).searchParams.get("category") !== "experts"
    )
      return route.continue();
    const response = await page.request.get(api + "/manager/agents", {
      headers: { Authorization: "Bearer test-only" },
    });
    const definition = (await response.json()).items.find(
      (d: any) => d.id === "expert-1",
    );
    await route.fulfill({
      json: {
        items: [
          {
            id: "expert-1:system",
            name: "产品策略顾问",
            detail: "协作专家",
            kind: "expert",
            definition,
          },
        ],
        next_cursor: null,
      },
    });
  });
}
async function chooseExpert(page: Page) {
  await page.goto("/tasks/s1");
  await page.locator(".composer textarea").fill("@");
  await page.getByRole("tab", { name: "专家", exact: true }).click();
  await page
    .getByRole("textbox", { name: "搜索专家", exact: true })
    .fill("产品策略");
  await expect(
    page.getByRole("option", { name: /产品策略顾问/ }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "搜索专家", exact: true })
    .press("Enter");
}

test("explicit expert collaboration sends on the same conversation and keeps its primary assistant", async ({
  page,
}) => {
  await personal(page);
  const invitations: any[] = [];
  let newTasks = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/manager/tasks") && r.method() === "POST") newTasks++;
  });
  await page.route("**/api/manager/tasks/s1/collaborators", async (route) => {
    invitations.push(route.request().postDataJSON());
    await route.fulfill({
      json: {
        session_id: "s1",
        collaborators: [],
        collaboration_allowed: true,
      },
    });
  });
  await page.goto("/tasks/s1");
  await page.getByRole("button", { name: "添加资源", exact: true }).click();
  await page.getByRole("menuitem", { name: "专家", exact: true }).click();
  await page.getByRole("menu", { name: "专家", exact: true })
    .getByRole("menuitem", { name: /产品策略顾问/ }).click();
  await expect(page.getByLabel("会话助手", { exact: true })).toContainText(
    "个人助理",
  );
  const invitation = page.getByRole("region", { name: "协作专家" });
  await expect(invitation).toContainText("邀请：");
  await expect(invitation).toContainText("产品策略顾问");
  await expect(invitation.locator(".catalog-avatar")).toHaveCount(0);
  await page.locator(".composer textarea").fill("请一起梳理产品需求");
  const chat = page.waitForRequest(
    (r) => r.url().endsWith("/chat/") && r.method() === "POST",
  );
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  expect((await chat).postDataJSON().session_id).toBe("s1");
  expect(invitations).toHaveLength(1);
  expect(invitations[0]).toMatchObject({
    experts: [{ definition_id: "expert-1", resource_view_type: "system" }],
  });
  expect(invitations[0].request_id).toBeTruthy();
  await expect(page).toHaveURL("/tasks/s1");
  expect(newTasks).toBe(0);
});

test("permission rejection retains draft and pending expert without sending chat", async ({
  page,
}) => {
  await personal(page);
  let chats = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/chat/")) chats++;
  });
  await page.route("**/api/manager/tasks/s1/collaborators", (route) =>
    route.fulfill({ status: 403, json: { detail: "专家使用授权已撤销" } }),
  );
  await chooseExpert(page);
  await page.locator(".composer textarea").fill("保留我的协作任务");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.getByText("专家使用授权已撤销")).toBeVisible();
  await expect(page.locator(".composer textarea")).toHaveValue(
    "保留我的协作任务",
  );
  await expect(page.getByRole("region", { name: "协作专家" })).toContainText(
    "产品策略顾问",
  );
  expect(chats).toBe(0);
});

test("sends the same invitation after the previous reply releases its session lock", async ({ page }) => {
  await personal(page);
  const ids: string[] = [];
  let finishRetry!: () => void;
  const retryPending = new Promise<void>((resolve) => { finishRetry = resolve; });
  await page.route("**/api/sessions/s1/status?**", (route) =>
    route.fulfill({ json: { session_id: "s1", status: "idle" } }),
  );
  await page.route("**/api/manager/tasks/s1/collaborators", async (route) => {
    ids.push(route.request().postDataJSON().request_id);
    if (ids.length === 1)
      return route.fulfill({ status: 409, json: {
        code: "collaboration_session_busy", detail: "对话正在运行",
        session_id: "s1", agent_id: "a1",
      } });
    await retryPending;
    return route.fulfill({ json: { session_id: "s1", collaborators: [] } });
  });
  await chooseExpert(page);
  await page.locator(".composer textarea").fill("整理成 Markdown");
  const chat = page.waitForRequest((request) => request.url().endsWith("/chat/") && request.method() === "POST");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  const waiting = page.getByText("上一轮正在收尾，结束后会自动继续");
  try {
    await expect(waiting).toBeVisible();
    await expect.poll(() => ids.length).toBe(2);
    await expect(waiting).toBeHidden();
  } finally {
    finishRetry();
  }
  expect((await chat).postDataJSON().input.content[0].text).toBe("整理成 Markdown");
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
});

test("removes a joined expert without sending another message", async ({ page }) => {
  await personal(page);
  await page.route("**/api/manager/tasks/s1", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ json: {
      ...(await response.json()), definition_id: "personal",
      definition_display_name: "个人助理", collaboration_allowed: true,
      collaborators: [{ definition_id: "expert-1", resource_view_type: "system",
        display_name: "产品策略顾问", status: "joined", worker_session_id: "worker-1" }],
    } });
  });
  let attempt = 0;
  await page.route("**/api/manager/tasks/s1/collaborators/worker-1", (route) => {
    expect(route.request().method()).toBe("DELETE");
    if (++attempt === 1)
      return route.fulfill({ status: 409, json: {
        code: "collaboration_session_busy", detail: "对话正在运行",
        session_id: "worker-1", agent_id: "worker-agent-1",
      } });
    return route.fulfill({ json: { session_id: "s1", collaborators: [] } });
  });
  await page.route("**/api/sessions/worker-1/status?**", (route) => {
    expect(new URL(route.request().url()).searchParams.get("agent_id")).toBe("worker-agent-1");
    return route.fulfill({ json: { session_id: "worker-1", status: "idle" } });
  });
  await page.goto("/tasks/s1");
  await expect(page.getByRole("region", { name: "协作专家" })).toContainText(
    "产品策略顾问",
  );
  await expect(
    page.getByRole("region", { name: "协作专家" }).locator(".catalog-avatar"),
  ).toHaveCount(0);
  const removed = page.waitForRequest((request) => request.url().endsWith("/collaborators/worker-1") && request.method() === "DELETE");
  await page.getByRole("button", { name: "移除协作专家 产品策略顾问" }).click();
  await removed;
  await expect(page.getByRole("region", { name: "协作专家" })).toHaveCount(0);
  expect(attempt).toBe(2);
});

test("removing a completed expert during leader cleanup keeps the composer usable and clears its window", async ({
  page,
}) => {
  await personal(page);
  let leaderBusy = true;
  let removed = false;
  const member = {
    definition_id: "expert-1", resource_view_type: "system",
    display_name: "产品策略顾问", status: "joined",
    worker_session_id: "worker-1",
  };
  await page.route("**/api/manager/tasks/s1", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ json: {
      ...(await response.json()),
      definition_id: "personal", definition_display_name: "个人助理",
      collaboration_allowed: true,
      collaborators: removed ? [] : [member],
      collaborator_progress: removed ? [] : [{
        worker_session_id: "worker-1", worker_agent_id: "worker-agent-1",
        display_name: "产品策略顾问", status: "completed",
        reply_id: "worker-reply", revision: 1, activities: [],
      }],
    } });
  });
  await page.route("**/api/manager/tasks/s1/collaborators/worker-1", (route) => {
    if (leaderBusy)
      return route.fulfill({ status: 409, json: {
        code: "collaboration_session_busy", detail: "对话正在运行",
        session_id: "s1", agent_id: "a1",
      } });
    removed = true;
    return route.fulfill({ json: { session_id: "s1", collaborators: [] } });
  });
  await page.route("**/api/sessions/s1/status?**", (route) =>
    route.fulfill({ json: {
      session_id: "s1", status: leaderBusy ? "running" : "idle",
    } }),
  );
  await page.goto("/tasks/s1");
  const window = page.getByRole("region", { name: "产品策略顾问", exact: true });
  await page.getByRole("button", { name: /产品策略顾问开始工作/ }).click();
  await expect(window.getByText("已完成")).toBeVisible();
  await page.locator(".composer textarea").fill("长任务：汇总专家成果");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.getByRole("button", { name: "停止生成", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "移除协作专家 产品策略顾问" }).click();
  const chips = page.getByRole("region", { name: "协作专家", exact: true });
  await expect(chips.getByRole("status")).toHaveText("正在移除");
  await page.request.post(api + "/__test/events", { data: {
    session_id: "s1",
    events: [{
      type: "REPLY_END", finished_reason: "completed",
    }],
  } });
  await page.locator(".composer textarea").fill("保留这条下一步要求");
  await expect(page.getByRole("button", { name: "发送消息", exact: true })).toBeEnabled();
  leaderBusy = false;
  await expect(chips).toHaveCount(0);
  await expect(window).toHaveCount(0);
  await expect(page.locator(".composer textarea")).toHaveValue("保留这条下一步要求");
});

test("retrying a rejected native send keeps the same invitation request identity", async ({
  page,
}) => {
  await personal(page);
  const requestIds: string[] = [];
  let chats = 0;
  await page.route("**/api/manager/tasks/s1/collaborators", async (route) => {
    requestIds.push(route.request().postDataJSON().request_id);
    await route.fulfill({
      json: {
        session_id: "s1",
        collaborators: [],
        collaboration_allowed: true,
      },
    });
  });
  await page.route("**/api/chat/", (route) => {
    if (++chats === 1)
      return route.fulfill({
        status: 409,
        json: { detail: "会话正在运行，请稍后重试" },
      });
    return route.continue();
  });
  await chooseExpert(page);
  await page.locator(".composer textarea").fill("重试协作");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.getByText("会话正在运行，请稍后重试")).toBeVisible();
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "已完成研究简报" }),
  ).toBeVisible();
  expect(requestIds).toHaveLength(2);
  expect(requestIds[0]).toBe(requestIds[1]);
  await expect(page).toHaveURL("/tasks/s1");
});

test("invited expert stays visible while the native reply is running", async ({
  page,
}) => {
  await personal(page);
  await page.route("**/api/manager/tasks/s1/collaborators", (route) =>
    route.fulfill({
      json: {
        session_id: "s1",
        agent_id: "a1",
        project_id: "project-1",
        name: "协作验收",
        definition_id: "personal",
        definition_display_name: "个人助理",
        updated_at: "",
        collaboration_allowed: true,
        pending_collaboration_request_id: route.request().postDataJSON()
          .request_id,
        collaborators: [
          {
            definition_id: "expert-1",
            resource_view_type: "system",
            display_name: "产品策略顾问",
            status: "pending",
          },
        ],
      },
    }),
  );
  await page.route("**/api/chat/", (route) =>
    route.fulfill({ status: 202, json: { status: "accepted" } }),
  );
  await chooseExpert(page);
  await page.locator(".composer textarea").fill("开始协作");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "停止生成", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "协作专家" })).toContainText(
    "产品策略顾问",
  );
});

test("reopened pending selection can be removed before sending and clears the server request", async ({
  page,
}) => {
  await personal(page);
  await page.route("**/api/manager/tasks/s1", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      json: {
        ...(await response.json()),
        definition_id: "personal",
        definition_display_name: "个人助理",
        collaboration_allowed: true,
        pending_collaboration_request_id: "persisted-request",
        collaborators: [
          {
            definition_id: "expert-1",
            resource_view_type: "system",
            display_name: "产品策略顾问",
            status: "pending",
          },
        ],
      },
    });
  });
  let clearing: any;
  await page.route("**/api/manager/tasks/s1/collaborators", (route) => {
    clearing = route.request().postDataJSON();
    return route.fulfill({
      json: { pending_collaboration_request_id: null, collaborators: [] },
    });
  });
  await page.goto("/tasks/s1");
  await page
    .getByRole("button", { name: "移除待协作专家 产品策略顾问" })
    .click();
  await page.locator(".composer textarea").fill("这次自行完成");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "已完成研究简报" }),
  ).toBeVisible();
  expect(clearing.experts).toEqual([]);
  expect(clearing.request_id).not.toBe("persisted-request");
});

test("many collaborators keep composer controls within the narrow viewport", async ({
  page,
}) => {
  await personal(page);
  await page.setViewportSize({ width: 390, height: 850 });
  await page.route("**/api/manager/tasks/s1", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      json: {
        ...(await response.json()),
        definition_id: "personal",
        definition_display_name: "个人助理",
        collaboration_allowed: true,
        collaborators: Array.from({ length: 8 }, (_, index) => ({
          definition_id: `expert-${index}`,
          resource_view_type: "system",
          display_name: `专家${index}协作验收`,
          status: "pending",
        })),
      },
    });
  });
  await page.goto("/tasks/s1");
  await expect(page.getByRole("region", { name: "协作专家" })).toBeVisible();
  const composer = await page.locator(".composer").boundingBox();
  const send = await page
    .getByRole("button", { name: "发送消息", exact: true })
    .boundingBox();
  expect(send!.x + send!.width).toBeLessThanOrEqual(
    composer!.x + composer!.width,
  );
  expect(send!.y + send!.height).toBeLessThanOrEqual(
    composer!.y + composer!.height,
  );
  expect(
    await page
      .locator(".composer")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
});
