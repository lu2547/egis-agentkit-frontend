import { expect, test, type Page } from "@playwright/test";

const catalogs = [
  ["experts", "agents", "专家"],
  ["skills", "skills", "技能"],
  ["connectors", "connectors", "连接器"],
  ["tools", "tools", "工具"],
] as const;

function entry(index: number, label: string) {
  return {
    id: `catalog-${index}`,
    resource_id: `catalog-${index}`,
    definition_type: "agent",
    agent_type: "expert",
    agent_name: `catalog_${index}`,
    agent_display_name: `${label} ${index}`,
    display_name: `${label} ${index}`,
    description: "目录测试说明",
    owner_type: "system",
    owner_id: "system",
    resource_view_type: "system",
    resource_version: "1.0.0",
    is_usable: true,
    is_system_default: true,
    is_installed: true,
    is_enabled: true,
    payload: { category: "研究分析", description: "目录测试说明", tags: [] },
  };
}

async function scrollToBottom(page: Page) {
  await page.locator(".catalog-content").evaluate((root) => {
    root.scrollTop = root.scrollHeight;
  });
}

test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
});

test("expert candidate checkbox persists independently of single summon", async ({ page }) => {
  let selected = false;
  const writes: string[] = [];
  await page.route(/\/manager\/agents(?:\?|$)/, (route) =>
    route.fulfill({
      json: {
        items: [{ ...entry(1, "专家"), is_invite_candidate: selected }],
        next_cursor: null,
      },
    }),
  );
  await page.route(/\/manager\/agents\/catalog-1\/invite-candidate\?/, (route) => {
    expect(new URL(route.request().url()).searchParams.get("view")).toBe("system");
    writes.push(route.request().method());
    selected = route.request().method() === "PUT";
    return route.fulfill({ status: 204 });
  });
  await page.goto("/experts");
  const card = page.getByTestId("catalog-card");
  const toggle = card.getByRole("button", { name: "自动邀请候选" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await card.getByRole("button", { name: "召唤", exact: true }).click();
  await expect(page).toHaveURL(/\bdefinition=catalog-1\b/);
  expect(writes).toEqual(["PUT", "DELETE"]);
});

for (const [path, kind, label] of catalogs) {
  test(`${kind} catalog appends one page per scroll to the bottom`, async ({
    page,
  }) => {
    const calls: Array<string | null> = [];
    const items = Array.from({ length: 23 }, (_, index) =>
      entry(index + 1, label),
    );
    await page.route(new RegExp(`/manager/${kind}(?:\\?|$)`), (route) => {
      const params = new URL(route.request().url()).searchParams;
      if (params.get("catalog") !== "true") {
        calls.push("unpaginated");
        return route.fulfill({ json: { items, next_cursor: null } });
      }
      const cursor = params.get("cursor");
      const offset = Number(cursor);
      calls.push(cursor);
      return route.fulfill({
        json: {
          items: items.slice(offset, offset + 10),
          next_cursor: offset + 10 < items.length ? String(offset + 10) : null,
          ...(cursor === null ? { categories: ["研究分析"] } : {}),
        },
      });
    });

    await page.setViewportSize({ width: 1500, height: 1400 });
    await page.goto(`/${path}`);
    const cards = page.getByTestId("catalog-card");
    await expect(cards).toHaveCount(10, { timeout: 3_000 });
    expect(calls).toEqual([null]);

    if (kind === "agents") {
      const content = page.locator(".catalog-content");
      expect(
        await content.evaluate((root) => root.scrollHeight - root.clientHeight),
      ).toBe(0);
      await content.hover();
      await page.mouse.wheel(0, 450);
      await expect(cards).toHaveCount(20);
      expect(calls).toEqual([null, "10"]);
      await page.setViewportSize({ width: 850, height: 500 });
    } else {
      await page.setViewportSize({ width: 850, height: 500 });
      await scrollToBottom(page);
      await expect(cards).toHaveCount(20);
      expect(calls).toEqual([null, "10"]);
    }
    await scrollToBottom(page);
    await expect(cards).toHaveCount(23);
    expect(calls).toEqual([null, "10", "20"]);
    await expect(page.getByRole("button", { name: "加载更多" })).toHaveCount(0);
    await scrollToBottom(page);
    await expect(
      page.getByRole("button", { name: `查看${label} 23`, exact: true }),
    ).toHaveCount(1);
    expect(calls).toEqual([null, "10", "20"]);
  });
}

test("catalog search and filters replace an in-flight page and keep result categories", async ({
  page,
}) => {
  let finishOldPage!: () => void;
  const oldPage = new Promise<void>((resolve) => {
    finishOldPage = resolve;
  });
  const calls: URLSearchParams[] = [];
  await page.route(/\/manager\/skills(?:\?|$)/, async (route) => {
    const params = new URL(route.request().url()).searchParams;
    calls.push(params);
    if (params.get("cursor")) {
      await oldPage;
      return route.fulfill({
        json: { items: [entry(11, "过期技能")], next_cursor: null },
      });
    }
    return route.fulfill({
      json: {
        items: params.get("query")
          ? [entry(12, "服务器结果")]
          : Array.from({ length: 10 }, (_, index) => entry(index + 1, "技能")),
        next_cursor: params.get("category") ? null : "10",
        categories: ["研究分析", "内容创作"],
      },
    });
  });

  await page.setViewportSize({ width: 850, height: 500 });
  await page.goto("/skills");
  const cards = page.getByTestId("catalog-card");
  await expect(cards).toHaveCount(10);
  const isOldPage = (request: import("@playwright/test").Request) =>
    new URL(request.url()).searchParams.get("cursor") === "10";
  const nextPage = page.waitForRequest(isOldPage);
  const oldPageEnded = Promise.race([
    page.waitForEvent("requestfinished", isOldPage),
    page.waitForEvent("requestfailed", isOldPage),
  ]);
  await scrollToBottom(page);
  await nextPage;
  const search = page.getByRole("textbox", { name: "搜索技能" });
  await search.fill("写");
  await search.fill("写作");
  await page.getByRole("tab", { name: "内容创作" }).click();
  await page.getByRole("button", { name: "我安装的" }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("服务器结果");
  await expect.poll(() => calls.at(-1)?.get("mine")).toBe("true");
  finishOldPage();
  await oldPageEnded;
  await expect(page.getByRole("tab", { name: "研究分析" })).toBeVisible();
  await expect(cards).toHaveCount(1);
  expect(calls.filter((params) => params.get("query") === "写")).toHaveLength(
    0,
  );
  expect(Object.fromEntries(calls.at(-1)!)).toMatchObject({
    catalog: "true",
    query: "写作",
    category: "内容创作",
    mine: "true",
  });
  expect(calls.at(-1)!.has("cursor")).toBe(false);
  await expect(page.locator(".catalog-content")).toHaveJSProperty(
    "scrollTop",
    0,
  );
});

test("retry keeps previous cards and appends each result once", async ({
  page,
}) => {
  const calls: Array<string | null> = [];
  await page.route(/\/manager\/connectors\?/, (route) => {
    const cursor = new URL(route.request().url()).searchParams.get("cursor");
    calls.push(cursor);
    if (cursor === null) {
      return route.fulfill({
        json: {
          items: Array.from({ length: 10 }, (_, index) =>
            entry(index + 1, "连接器"),
          ),
          next_cursor: "10",
        },
      });
    }
    if (calls.length === 2) {
      return route.fulfill({
        status: 503,
        json: { detail: "暂时无法读取下一页" },
      });
    }
    return route.fulfill({
      json: {
        items: [entry(10, "连接器"), entry(11, "连接器")],
        next_cursor: null,
      },
    });
  });

  await page.setViewportSize({ width: 850, height: 500 });
  await page.goto("/connectors");
  const cards = page.getByTestId("catalog-card");
  await expect(cards).toHaveCount(10);
  await scrollToBottom(page);
  await expect(page.getByRole("alert")).toContainText("暂时无法读取下一页");
  await expect(cards).toHaveCount(10);
  await page.getByRole("button", { name: "重新加载" }).click();
  await expect(cards).toHaveCount(11);
  await expect(
    page.getByRole("button", { name: "查看连接器 10", exact: true }),
  ).toHaveCount(1);
  await expect(page.getByRole("button", { name: "加载更多" })).toHaveCount(0);
  expect(calls).toEqual([null, "10", "10"]);
});
