import { test, expect, type Locator } from "@playwright/test";

async function expectNeutral(control: Locator) {
  await expect(control).toBeVisible();
  await expect
    .poll(async () =>
      control.evaluate((element) => {
        const style = getComputedStyle(element);
        return [
          "color",
          "background-color",
          "border-top-color",
          "outline-color",
          "box-shadow",
        ].flatMap((property) =>
          [
            ...style
              .getPropertyValue(property)
              .matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)/g),
          ]
            .filter(
              (match) =>
                Number(match[3]) > Number(match[1]) + 15 &&
                Number(match[3]) > Number(match[2]) + 8,
            )
            .map((match) => `${property}: ${match[0]}`),
        );
      }),
    )
    .toEqual([]);
}

test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
});

for (const theme of ["light", "dark"] as const) {
  test.describe(`${theme} neutral forms`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(
        (value) => localStorage.setItem("pension-gpt-theme", value),
        theme,
      );
    });

    test("login password uses one thin neutral focus border", async ({
      page,
    }, testInfo) => {
      await page.addInitScript(() =>
        sessionStorage.removeItem("egis_access_token"),
      );
      await page.goto("/");
      const password = page.getByLabel("密码", { exact: true });
      await password.focus();
      const wrapper = password.locator("..");
      await expectNeutral(wrapper);
      await expect(wrapper).toHaveCSS("box-shadow", "none");
      await expect(wrapper).toHaveCSS("border-top-width", "1px");
      await expect(password).toHaveCSS("outline-style", "none");
      await expectNeutral(
        page.getByRole("button", { name: "登录", exact: true }),
      );
      await page.screenshot({
        path: testInfo.outputPath(`login-${theme}.png`),
      });
    });

    test("catalog card buttons preserve gray keyboard focus", async ({
      page,
    }) => {
      await page.goto("/experts");
      const button = page.getByRole("button", {
        name: "查看研究分析专家",
        exact: true,
      });
      await page.keyboard.press("Tab");
      await button.focus();
      await expectNeutral(button);
      await expect(button).toHaveCSS("outline-style", "solid");
      expect(
        parseFloat(
          await button.evaluate(
            (element) => getComputedStyle(element).outlineWidth,
          ),
        ),
      ).toBeGreaterThan(0);
      await expectNeutral(
        page
          .getByTestId("catalog-card")
          .first()
          .getByRole("button", { name: "召唤", exact: true }),
      );
    });

    test("personal assistant textarea retains a gray focus state", async ({
      page,
    }) => {
      await page.goto("/experts?tab=personal");
      const editor = page.locator(".document-panel textarea:visible");
      await editor.focus();
      await expectNeutral(editor);
      await expectNeutral(
        page.getByRole("button", { name: "保存设置", exact: true }),
      );
    });

    test("expert and team editors return to their source catalog", async ({
      page,
    }, testInfo) => {
      for (const [tab, name] of [
        ["agent", "专家"],
        ["team", "专家团"],
      ] as const) {
        await page.goto(`/experts?tab=${tab}`);
        await page
          .getByRole("button", { name: `添加${name}`, exact: true })
          .click();
        await expect(
          page.getByRole("heading", { name: `创建${name}`, exact: true }),
        ).toBeVisible();
        const input = page.locator("#definition-name input");
        await input.focus();
        await expectNeutral(input.locator(".."));
        await expectNeutral(
          page.getByRole("button", { name: `保存${name}`, exact: true }),
        );
        await page.screenshot({
          path: testInfo.outputPath(`create-${tab}-${theme}.png`),
        });
        await page
          .getByRole("button", { name: `返回${name}目录`, exact: true })
          .click();
        await expect(page).toHaveURL(`/experts?tab=${tab}`);
        await page
          .getByTestId("catalog-card")
          .filter({
            has: page.getByRole("button", { name: "编辑", exact: true }),
          })
          .first()
          .getByRole("button", { name: "编辑", exact: true })
          .click();
        await expect(
          page.getByRole("heading", { name: `编辑${name}`, exact: true }),
        ).toBeVisible();
        await page.getByRole("button", { name: "取消", exact: true }).click();
        await expect(page).toHaveURL(`/experts?tab=${tab}`);
      }
      await page.goto("/teams/new");
      await page.getByRole("button", { name: "取消", exact: true }).click();
      await expect(page).toHaveURL("/experts?tab=team");
    });

    test("skill editor shares form actions and returns to skills", async ({
      page,
    }, testInfo) => {
      await page.goto("/skills");
      await page.getByRole("button", { name: "添加技能", exact: true }).click();
      await page
        .getByRole("menuitem", { name: "创建技能", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog
        .getByRole("textbox", { name: "技能 ID", exact: true })
        .focus();
      await expectNeutral(dialog.locator(".t-input--focused"));
      await expectNeutral(dialog.locator(".t-checkbox__input"));
      await expectNeutral(
        dialog.getByRole("button", { name: "发布版本", exact: true }),
      );
      await expect
        .poll(() =>
          dialog
            .locator(".t-dialog")
            .evaluate((element) => element.getBoundingClientRect().width),
        )
        .toBeGreaterThan(700);
      await page.screenshot({
        path: testInfo.outputPath(`create-skill-${theme}.png`),
      });
      await dialog
        .getByRole("button", { name: "返回技能目录", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      await expect(page).toHaveURL("/skills");
    });

    test("connector and administration dialogs inherit the gray palette", async ({
      page,
    }) => {
      await page.route("**/api/manager/connectors", (route) =>
        route.fulfill({
          json: {
            items: [
              {
                resource_id: "test-mcp",
                resource_version: "1.0.0",
                display_name: "测试连接器",
                description: "连接器配置",
                owner_type: "user",
                owner_id: "demo",
                resource_view_type: "private",
                is_usable: true,
                is_editable: true,
                is_installed: true,
                is_enabled: true,
                payload: {
                  config: {
                    transport: "streamable_http",
                    url: "https://example.com/mcp",
                  },
                },
              },
            ],
          },
        }),
      );
      await page.goto("/connectors");
      await page
        .getByTestId("catalog-card")
        .getByRole("button", { name: "编辑", exact: true })
        .click();
      const connector = page.getByRole("dialog");
      await connector
        .getByRole("textbox", { name: "名称", exact: true })
        .focus();
      await expectNeutral(connector.locator(".t-input--focused"));
      await connector.locator(".t-select").click();
      await expectNeutral(page.locator(".t-select-option.t-is-selected"));
      await page.keyboard.press("Escape");
      await connector
        .getByRole("button", { name: "取消", exact: true })
        .click();
      await page.goto("/admin/groups");
      await page
        .getByRole("button", { name: "创建用户组", exact: true })
        .click();
      const admin = page.getByRole("dialog");
      await admin.getByRole("textbox", { name: "组名称", exact: true }).focus();
      await expectNeutral(admin.locator(".t-input--focused"));
      await expectNeutral(admin.locator(".t-checkbox__input"));
      await expectNeutral(
        admin.getByRole("button", { name: "保存用户组", exact: true }),
      );
    });
  });
}
