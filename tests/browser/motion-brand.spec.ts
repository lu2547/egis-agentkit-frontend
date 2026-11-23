import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page, request }, testInfo) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.emulateMedia({ colorScheme: "light" });
  if (!testInfo.title.startsWith("login centers")) {
    await page.addInitScript(() =>
      sessionStorage.setItem("egis_access_token", "test-only"),
    );
  }
});

test("brand artwork follows theme and the account avatar follows the user's name", async ({
  page,
}) => {
  await page.route("**/api/manager/me", (route) =>
    route.fulfill({
      json: {
        user_id: "lu",
        username: "陆小明",
        role_type: "user",
        group_ids: [],
        is_enabled: true,
      },
    }),
  );
  await page.goto("/");
  await expect(page.locator(".account-avatar")).toHaveText("陆");
  await expect(
    page.locator(".brand-identity:not(.is-welcome) img"),
  ).toHaveAttribute("src", "/brand/wordmark-v2-light.png");
  await expect(page.locator(".is-welcome img")).toHaveAttribute(
    "src",
    "/brand/welcome-v2-light.png",
  );
  await expect(
    page.getByRole("heading", { name: "今天，想一起完成什么？" }),
  ).toBeVisible();
  await expect(page.locator(".composer-mascot")).toHaveCount(0);
  await page.getByRole("button", { name: "切换深色模式", exact: true }).click();
  await expect(
    page.locator(".brand-identity:not(.is-welcome) img"),
  ).toHaveAttribute("src", "/brand/wordmark-v2-dark.png");
  await expect(page.locator(".is-welcome img")).toHaveAttribute(
    "src",
    "/brand/welcome-v2-dark.png",
  );
});

test("workspace and sidebar use layout transitions, rapid toggles release hidden controls", async ({
  page,
}) => {
  await page.goto("/tasks/s1");
  const sidebar = page.locator(".sidebar-slot");
  expect(
    await sidebar.evaluate((el) => getComputedStyle(el).transitionProperty),
  ).toContain("width");
  await page.getByRole("button", { name: "收起导航", exact: true }).click();
  await expect
    .poll(async () => Math.round((await sidebar.boundingBox())!.width))
    .toBe(48);
  await page.getByRole("button", { name: "展开侧边栏", exact: true }).click();
  await expect
    .poll(async () => Math.round((await sidebar.boundingBox())!.width))
    .toBe(280);
  const panel = page.locator(".workspace-panel");
  if (await panel.isVisible()) {
    await page
      .getByRole("button", { name: "收起右侧面板", exact: true })
      .click();
    await expect(panel).not.toBeVisible();
  }
  await page.getByRole("button", { name: "打开右侧面板", exact: true }).click();
  await expect(panel).toBeVisible();
  await expect
    .poll(async () => Math.round((await panel.boundingBox())!.width))
    .toBe(500);
  await page.getByRole("button", { name: "收起右侧面板", exact: true }).click();
  await page.getByRole("button", { name: "打开右侧面板", exact: true }).click();
  await expect(panel).toBeVisible();
  await expect(panel).not.toHaveAttribute("inert", "");
});

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`app animations stay active with ${reducedMotion} on a narrow screen`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByTestId("permission-mode-trigger").click();
    const popup = page.locator(".permission-mode-popover");
    await expect(popup).toBeVisible();
    const motion = await page.evaluate(() => {
      const label = document.createElement("span");
      label.className = "running-shimmer";
      label.textContent = "正在处理";
      const route = document.createElement("div");
      route.className = "page-enter-active";
      const probe = document.createElement("div");
      probe.style.cssText = "position:fixed;left:-9999px";
      probe.setAttribute("aria-hidden", "true");
      probe.append(label, route);
      document.body.append(probe);
      const result = {
        animation: getComputedStyle(label).animationName,
        duration: getComputedStyle(label).animationDuration,
        transition: getComputedStyle(route).transitionDuration,
      };
      probe.remove();
      return result;
    });
    expect(motion.animation).toBe("activity-shimmer");
    expect(motion.duration).toBe("2.1s");
    expect(
      motion.transition.split(",").every((value) => parseFloat(value) > 0),
    ).toBe(true);
    const bounds = (await popup.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    await page.keyboard.press("Escape");
    await expect(popup).not.toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`login centers the themed brand above the form without extra copy in ${theme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    if (theme === "dark")
      await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const heading = page.getByRole("heading", {
      name: "养老险GPT",
      exact: true,
    });
    await expect(heading).toBeVisible();
    await expect(page.getByLabel("UM账号", { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("输入UM账号")).toBeVisible();
    await expect(heading.locator("img")).toHaveAttribute(
      "src",
      `/brand/wordmark-v2-${theme}.png`,
    );
    for (const text of [
      "欢迎回来",
      "你的企业工作伙伴",
      "登录后，继续你的工作。",
      "请使用管理员分配的账号。演示登录需由服务端明确开启。",
      "让每一项工作，都有可靠的伙伴。",
    ]) {
      await expect(page.getByText(text, { exact: true })).toHaveCount(0);
    }
    const form = (await page.locator(".login-panel form").boundingBox())!;
    const brand = (await heading.locator("img").boundingBox())!;
    expect(brand.x + brand.width / 2).toBeCloseTo(form.x + form.width / 2, 0);
    expect(brand.y + brand.height).toBeLessThan(form.y);
    await expect(
      page.getByRole("button", { name: "登录", exact: true }),
    ).toBeDisabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  });
}

for (const mode of ["light", "dark"]) {
  test(`${mode} collapsed sidebar shows a complete sheep icon and a single expand control`, async ({
    page,
  }) => {
    await page.goto("/");
    if (mode === "dark")
      await page
        .getByRole("button", { name: "切换深色模式", exact: true })
        .click();
    await page.getByRole("button", { name: "收起导航", exact: true }).click();
    const icon = page.locator(".sidebar.collapsed .brand-identity img");
    await expect(icon).toHaveAttribute("src", "/brand/assistant-icon.png");
    await expect(page.locator(".sidebar .expand-sidebar")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "展开侧边栏", exact: true }),
    ).toHaveCount(1);
    const image = await icon.boundingBox();
    const rail = await page.locator(".sidebar").boundingBox();
    expect(image!.x).toBeGreaterThanOrEqual(rail!.x);
    expect(image!.x + image!.width).toBeLessThanOrEqual(rail!.x + rail!.width);
  });
}
