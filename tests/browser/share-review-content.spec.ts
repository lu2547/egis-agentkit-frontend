import { expect, test } from "@playwright/test";

const review = {
  review_id: "share-audit",
  resource_type: "agent",
  resource_id: "expert-audit",
  resource_version: "2",
  version_label: "1.1",
  review_type: "share",
  review_status_type: "pending",
  review_reason: "",
  share_scope_type: "group",
  principal_id: "company",
  owner_id: "alice",
  submitted_by: "alice",
};
const node = {
  resource_type: "agent",
  resource_id: "expert-audit",
  resource_version: "2",
  version_label: "1.1",
  display_name: "已提交的研究专家",
  checksum_sha256: "a".repeat(64),
  owner_type: "user",
  owner_id: "alice",
  origin: "submitted",
  payload: { system_prompt: "只分析已提交的不可变内容。", bindings: [] },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
  await page.route("**/api/manager/**", (route) =>
    route.fulfill({ json: { items: [], next_cursor: null, categories: [] } }),
  );
  await page.route("**/manager/assistant", (route) =>
    route.fulfill({
      json: {
        id: "assistant",
        agent_type: "personal",
        payload: { avatar: "spark", bindings: [] },
      },
    }),
  );
  await page.route("**/manager/me", (route) =>
    route.fulfill({
      json: {
        user_id: "admin",
        username: "审核员",
        role_type: "admin",
        group_ids: [],
        is_enabled: true,
      },
    }),
  );
  await page.route(/\/manager\/admin\/share-reviews(?:\?|$)/, (route) =>
    route.fulfill({
      json: {
        items: [review],
        page: 1,
        page_size: 20,
        has_next: false,
      },
    }),
  );
});

test("reviewer sees frozen content and exact skill and connector context", async ({
  page,
}) => {
  await page.route("**/manager/admin/share-reviews/share-audit", (route) =>
    route.fulfill({
      json: {
        ...review,
        content: {
          origin: "submitted",
          captured_at: "2026-11-26T00:00:00Z",
          root: node,
          dependencies: [
            {
              ...node,
              resource_type: "skill",
              resource_id: "source-skill",
              display_name: "资料核对技能",
              resource_version: "1.3.0",
              payload: {
                markdown: "# 技能审阅正文",
                files: { "SKILL.md": { sha256: "b".repeat(64) } },
              },
            },
            {
              ...node,
              resource_type: "mcp",
              resource_id: "source-mcp",
              display_name: "文档连接器",
              resource_version: "1.0.0",
              configuration_revision: 3,
              payload: {
                config: {
                  transport: "streamable_http",
                  url: "https://audit.example/mcp",
                  auth_type: "api_key",
                },
              },
            },
          ],
        },
      },
    }),
  );
  await page.goto("/admin/share-reviews");
  await page.getByRole("button", { name: "审核版本" }).click();
  const dialog = page.getByRole("dialog", { name: "共享申请详情" });
  await expect(dialog).toContainText("只分析已提交的不可变内容。");
  await expect(dialog).toContainText("技能审阅正文");
  await expect(dialog).toContainText("1.3.0");
  await expect(dialog).toContainText("https://audit.example/mcp");
  await expect(dialog).toContainText("配置修订 3");
  await expect(
    dialog.getByRole("button", { name: "通过共享申请" }),
  ).toBeEnabled();
});

test("review loading failure prevents approving unseen content", async ({
  page,
}) => {
  await page.route("**/manager/admin/share-reviews/share-audit", (route) =>
    route.fulfill({ status: 503, json: { detail: "审核内容暂不可读取" } }),
  );
  await page.goto("/admin/share-reviews");
  await page.getByRole("button", { name: "审核版本" }).click();
  const dialog = page.getByRole("dialog", { name: "共享申请详情" });
  await expect(dialog).toContainText("审核内容暂不可读取");
  await expect(
    dialog.getByRole("button", { name: "通过共享申请" }),
  ).toBeDisabled();
});

test("late batch content cannot approve a different selection", async ({
  page,
}) => {
  const skillA = {
    ...review,
    review_id: "skill-a-review",
    resource_type: "skill",
    resource_id: "skill-a",
  };
  const skillB = {
    ...skillA,
    review_id: "skill-b-review",
    resource_id: "skill-b",
  };
  await page.route(/\/manager\/admin\/share-reviews(?:\?|$)/, (route) =>
    route.fulfill({
      json: {
        items: [skillA, skillB],
        page: 1,
        page_size: 20,
        has_next: false,
      },
    }),
  );
  let releaseA: () => void = () => {};
  let releaseB: () => void = () => {};
  const heldA = new Promise<void>((resolve) => {
    releaseA = resolve;
  });
  const heldB = new Promise<void>((resolve) => {
    releaseB = resolve;
  });
  for (const [item, held] of [
    [skillA, heldA],
    [skillB, heldB],
  ] as const) {
    await page.route(
      `**/manager/admin/share-reviews/${item.review_id}`,
      async (route) => {
        await held;
        await route.fulfill({
          json: {
            ...item,
            content: {
              origin: "submitted",
              captured_at: null,
              root: {
                ...node,
                resource_type: "skill",
                resource_id: item.resource_id,
                payload: { markdown: `已查看 ${item.resource_id}`, files: {} },
              },
              dependencies: [],
            },
          },
        });
      },
    );
  }
  await page.goto("/admin/share-reviews");
  await page
    .getByRole("checkbox", { name: "选择 skill-a", exact: true })
    .check();
  await page.getByRole("button", { name: "批量审核", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "批量审核", exact: true });
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "选择 skill-a", exact: true })
    .uncheck();
  await page
    .getByRole("checkbox", { name: "选择 skill-b", exact: true })
    .check();
  await page.getByRole("button", { name: "批量审核", exact: true }).click();
  const staleResponse = page.waitForResponse((response) =>
    response.url().endsWith("/skill-a-review"),
  );
  releaseA();
  await (await staleResponse).finished();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(
    dialog.getByRole("button", { name: "批量通过", exact: true }),
  ).toBeDisabled();
  await expect(dialog).not.toContainText("已查看 skill-a");
  releaseB();
  await expect(dialog).toContainText("已查看 skill-b");
  await expect(
    dialog.getByRole("button", { name: "批量通过", exact: true }),
  ).toBeEnabled();
});

test("owner withdrawal stays shared while the request awaits approval", async ({
  page,
}) => {
  const owned = {
    id: "expert-audit",
    definition_type: "agent",
    agent_type: "expert",
    agent_name: "audit",
    agent_display_name: "我的审核专家",
    owner_type: "user",
    owner_id: "alice",
    resource_view_type: "private",
    resource_version: "2",
    version_label: "1.1",
    owner_version: 2,
    is_editable: true,
    is_deletable: true,
    is_usable: true,
    payload: {
      description: "审核示例",
      bindings: [],
      tags: [],
      starter_prompts: [],
    },
  };
  const original = {
    ...review,
    review_status_type: "approved",
    is_current: true,
  };
  let revocationPending = false;
  await page.route("**/manager/me", (route) =>
    route.fulfill({
      json: {
        user_id: "alice",
        username: "资源所有者",
        role_type: "user",
        group_ids: [],
        is_enabled: true,
      },
    }),
  );
  await page.route(/\/manager\/agents(?:\?|$)/, (route) =>
    route.fulfill({
      json: { items: [owned], categories: [], next_cursor: null },
    }),
  );
  await page.route(/\/manager\/agents\/expert-audit(?:\?|$)/, (route) =>
    route.fulfill({ json: owned }),
  );
  await page.route("**/manager/share-requests", (route) =>
    route.fulfill({
      json: {
        items: revocationPending
          ? [
              original,
              {
                ...review,
                review_id: "revoke-request",
                review_type: "revoke",
                original_review_id: original.review_id,
              },
            ]
          : [original],
      },
    }),
  );
  await page.route("**/manager/share-requests/share-audit", (route) => {
    expect(route.request().method()).toBe("DELETE");
    revocationPending = true;
    return route.fulfill({ status: 204 });
  });
  await page.route("**/manager/share-requests/revoke-request", (route) => {
    expect(route.request().method()).toBe("DELETE");
    revocationPending = false;
    return route.fulfill({ status: 204 });
  });
  await page.goto("/experts");
  await page.getByRole("button", { name: "查看我的审核专家" }).click();
  const shares = page.getByRole("region", { name: "共享管理" });
  await shares
    .getByRole("button", { name: "申请撤回共享", exact: true })
    .click();
  await page.getByRole("button", { name: "确定", exact: true }).click();
  await expect(shares).toContainText("撤回申请审核中，当前共享继续生效");
  await shares
    .getByRole("button", { name: "取消撤回申请", exact: true })
    .click();
  await page.getByRole("button", { name: "确定", exact: true }).click();
  await expect(
    shares.getByRole("button", { name: "申请撤回共享", exact: true }),
  ).toBeVisible();
  await expect(shares).toContainText("已共享");
});
