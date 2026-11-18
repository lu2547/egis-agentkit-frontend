import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
});

test("permission remains actionable when process is collapsed and disappears after result", async ({
  page,
}) => {
  await page.goto("/tasks/s1");
  const input = page.locator("textarea");
  await input.fill("测试确认");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.getByText("需要你的确认")).toHaveCount(1);
  await expect(page.locator(".process-heading")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(
    page.getByRole("button", { name: "允许此次操作" }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "本会话记住此授权" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "允许此次操作" }).click();
  await expect(page.getByText("需要你的确认")).toHaveCount(0);
});

for (const choice of ["remember", "once", "deny"] as const) {
  test(`confirmation sends session rules only when approved with remember selected (${choice})`, async ({
    page,
  }) => {
    if (choice === "remember")
      await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/tasks/s1");
    await page.locator("textarea").fill("测试确认并记住");
    await page.getByRole("button", { name: "发送消息" }).click();
    const remember = page.getByRole("checkbox", { name: "本会话记住此授权" });
    await expect(remember).toBeVisible();
    await expect(remember).not.toBeChecked();
    if (choice !== "once") {
      await page.getByText("本会话记住此授权", { exact: true }).click();
      await expect(remember).toBeChecked();
      await expect(page.getByText("研究资料/**", { exact: true })).toBeVisible();
    }
    const submitted = page.waitForRequest(
      (request) =>
        request.method() === "POST" && request.url().endsWith("/chat/"),
    );
    const action = {
      remember: "允许并记住",
      deny: "拒绝",
      once: "允许此次操作",
    }[choice];
    await page.getByRole("button", { name: action }).click();
    const { session_id, input } = (await submitted).postDataJSON();
    expect(session_id).toBe("s1");
    expect(input.confirm_results).toEqual([
      expect.objectContaining({
        confirmed: choice !== "deny",
        rules:
          choice === "remember"
            ? [
                {
                  tool_name: "检索工作资料",
                  rule_content: "研究资料/**",
                  behavior: "allow",
                  source: "session",
                },
              ]
            : null,
      }),
    ]);
  });
}

test("plus menu opens searchable resources and file picker", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "添加资源" }).click();
  await expect(page.locator(".picker-panel")).toHaveCount(0);
  await expect(page.locator(".resource-picker > .menu-row")).toHaveText([
    "添加文件",
    "模式",
    "专家",
    "技能",
    "连接器",
  ]);
  await expect(page.getByRole("menuitem", { name: "添加文件" })).toBeVisible();
  await page.getByRole("menuitem", { name: "专家", exact: true }).click();
  await expect(page.getByPlaceholder("搜索专家")).toBeVisible();
  await page.getByPlaceholder("搜索专家").fill("不存在的专家");
  await expect(page.getByText("没有匹配的专家")).toBeVisible();
});

test("file flyout opens the real local file chooser", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "添加资源" }).click();
  await page.getByRole("menuitem", { name: "添加文件", exact: true }).hover();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "从本地上传" }).click();
  await (
    await chooser
  ).setFiles({
    name: "研究资料.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("local working document"),
  });
  await expect(page.locator(".composer .attachments")).toContainText(
    "研究资料.txt",
  );
  await expect(page.getByRole("button", { name: "添加资源" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

test("mode flyout uses runtime modes and persists the native setting", async ({
  page,
}) => {
  await page.goto("/tasks/s1");
  await page.getByRole("button", { name: "添加资源" }).click();
  await page.getByRole("menuitem", { name: "模式", exact: true }).hover();
  const panel = page.getByRole("menu", { name: "模式", exact: true });
  await expect(panel.getByRole("menuitemradio")).toHaveCount(4);
  await expect(panel.locator('[data-mode="bypass"]')).toBeEnabled();
  const request = page.waitForRequest(
    (request) =>
      request.url().endsWith("/manager/tasks/s1/settings") &&
      request.method() === "PATCH",
  );
  await panel.locator('[data-mode="explore"]').click();
  expect((await request).postDataJSON().permission_mode).toBe("explore");
  await page.getByRole("button", { name: "添加资源" }).click();
  await page.getByRole("menuitem", { name: "模式", exact: true }).hover();
  await expect(panel.locator('[data-mode="explore"]')).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("hover flyout keeps the root menu anchored while crossing into selectable experts", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 600 });
  await page.goto("/");
  const plus = page.getByRole("button", { name: "添加资源" });
  await plus.click();
  const menu = page.locator(".resource-picker");
  const before = await menu.boundingBox();
  await page.getByRole("menuitem", { name: "专家", exact: true }).hover();
  const expert = page.getByRole("menuitem", { name: /研究分析专家/ });
  await expect(expert).toBeVisible();
  const after = await menu.boundingBox();
  expect(after!.x).toBeCloseTo(before!.x, 0);
  expect(after!.y).toBeCloseTo(before!.y, 0);
  expect(after!.width).toBeCloseTo(before!.width, 0);
  const row = await page
    .getByRole("menuitem", { name: "专家", exact: true })
    .boundingBox();
  const panel = await page.locator(".picker-panel").boundingBox();
  await page.mouse.move(panel!.x + 6, row!.y + row!.height / 2, { steps: 12 });
  await expert.hover();
  await expect(plus).toHaveAttribute("aria-expanded", "true");
  await expert.click();
  await expect(plus).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("region", { name: "协作专家" })).toContainText(
    "研究分析专家",
  );
});

test("resource action uses installation API and refreshes its real state", async ({
  page,
}) => {
  let enabled = false;
  let patches = 0;
  const item = {
    resource_id: "skill-1",
    resource_version: "1",
    display_name: "研究技能",
    description: "研究",
    is_usable: true,
    is_installed: true,
    is_enabled: false,
    owner_type: "system",
    owner_id: "system",
    payload: {},
  };
  await page.route("**/api/manager/skills", (route) =>
    route.fulfill({ json: { items: [{ ...item, is_enabled: enabled }] } }),
  );
  await page.route(
    "**/api/manager/skills/skill-1/installation**",
    async (route) => {
      patches++;
      enabled = route.request().postDataJSON().is_enabled;
      await route.fulfill({ json: {} });
    },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "添加资源" }).click();
  await page.getByRole("menuitem", { name: "技能", exact: true }).click();
  await page.getByPlaceholder("搜索技能").fill("研究");
  await page.getByRole("menuitemcheckbox", { name: /研究技能.*启用/ }).click();
  await expect(
    page.getByRole("menuitemcheckbox", { name: /研究技能.*已启用/ }),
  ).toBeVisible();
  expect(patches).toBe(1);
});

test("inviting an expert keeps personal resource changes available", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "添加资源" }).click();
  await page.getByRole("menuitem", { name: "专家", exact: true }).click();
  await page.getByRole("menuitem", { name: /研究分析专家/ }).click();
  await page.getByRole("button", { name: "添加资源" }).click();
  await page.getByRole("menuitem", { name: "技能", exact: true }).click();
  await expect(
    page.getByRole("menuitemcheckbox", { name: /研究方法/ }),
  ).toBeVisible();
});

test("composer keeps a single focus boundary and opens a viewport-safe hover submenu", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 600 });
  await page.goto("/");
  const input = page.locator(".composer textarea");
  await input.focus();
  expect(await input.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe(
    "none",
  );
  const plus = page.getByRole("button", { name: "添加资源" });
  const before = await plus.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  await plus.hover();
  await expect
    .poll(() => plus.evaluate((el) => getComputedStyle(el).backgroundColor))
    .not.toBe(before);
  await plus.click();
  await page.getByRole("menuitem", { name: "专家", exact: true }).hover();
  await expect(page.getByPlaceholder("搜索专家")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "添加文件" })).toBeVisible();
  const box = await page.locator(".resource-picker").boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(1000);
  expect(box!.y + box!.height).toBeLessThanOrEqual(600);
});

test("late resource response cannot replace the active category", async ({
  page,
}) => {
  let release!: () => void;
  const waitForSkills = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/manager/skills", async (route) => {
    await waitForSkills;
    await route.fulfill({
      json: {
        items: [
          {
            resource_id: "late",
            resource_version: "1",
            display_name: "过期技能",
            description: "",
            is_usable: true,
          },
        ],
      },
    });
  });
  await page.route("**/api/manager/connectors", (route) =>
    route.fulfill({ json: { items: [] } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "添加资源" }).click();
  await page.getByRole("menuitem", { name: "技能", exact: true }).hover();
  await page.getByRole("menuitem", { name: "连接器", exact: true }).hover();
  await expect(page.getByText("没有匹配的连接器")).toBeVisible();
  release();
  await expect(page.getByText("过期技能")).toHaveCount(0);
  await expect(page.getByText("没有匹配的连接器")).toBeVisible();
});

test("an unauthorized connector in the composer opens the marketplace instead of installing", async ({
  page,
}) => {
  await page.route("**/manager/connectors", (route) =>
    route.fulfill({
      json: {
        items: [{
          resource_id: "company-files",
          display_name: "公司文件",
          is_usable: true,
          is_authorized: false,
          is_installed: false,
          is_enabled: false,
          auth_type: "oauth",
          payload: {},
        }],
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "添加资源" }).click();
  await page.getByRole("menuitem", { name: "连接器", exact: true }).hover();
  const connector = page.getByRole("menuitemcheckbox", { name: /公司文件/ });
  await expect(connector).toContainText("去广场授权");
  await connector.click();
  await expect(page).toHaveURL(/\/connectors$/);
  await expect(page.getByRole("button", { name: "授权", exact: true })).toBeVisible();
});

for (const viewport of [
  { width: 1200, height: 620 },
  { width: 390, height: 700 },
]) {
  test(`local upload stays reachable after choosing an expert at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/?definition=expert-0");
    await expect(page.getByRole("region", { name: "协作专家" })).toContainText(
      "研究分析专家",
    );
    await page.getByRole("button", { name: "添加资源" }).click();
    const row = page.getByRole("menuitem", { name: "添加文件", exact: true });
    if (viewport.width < 500) await row.click();
    else await row.hover();
    const upload = page.getByRole("menuitem", {
      name: "从本地上传",
      exact: true,
    });
    await expect(upload).toBeVisible();
    const bounds = (await upload.boundingBox())!;
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    // Follow a human pointer path rather than teleporting straight to the submenu.
    await page.mouse.move(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
      { steps: 20 },
    );
    await expect(upload).toBeVisible();
    const chooser = page.waitForEvent("filechooser");
    await upload.click();
    await (
      await chooser
    ).setFiles({
      name: "本地上传验证.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("file picker upload"),
    });
    await expect(page.locator(".composer .attachments")).toContainText(
      "本地上传验证.txt",
    );
    await expect(
      page.getByRole("button", { name: "添加资源" }),
    ).toHaveAttribute("aria-expanded", "false");
  });
}
