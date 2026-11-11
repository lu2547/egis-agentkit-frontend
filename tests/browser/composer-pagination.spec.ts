import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
});

for (const theme of ["light", "dark"] as const) {
  test(`picker uses server pagination and keyboard selection follows scroll in ${theme}`, async ({
    page,
  }) => {
    await page.addInitScript(
      (theme) => localStorage.setItem("pension-gpt-theme", theme),
      theme,
    );
    const cursors: (string | null)[] = [];
    const pageSize = 8;
    const total = 23;
    await page.route("**/api/manager/composer/options?**", (route) => {
      const params = new URL(route.request().url()).searchParams;
      expect(params.has("limit")).toBe(false);
      if (params.get("category") !== "context")
        return route.fulfill({ json: { items: [], next_cursor: null } });
      const offset = Number(params.get("cursor") || 0);
      cursors.push(params.get("cursor"));
      return route.fulfill({
        json: {
          items: Array.from(
            { length: Math.min(pageSize, total - offset) },
            (_, index) => ({
              id: `file-${offset + index}`,
              name: `资料${String(offset + index).padStart(2, "0")}.txt`,
              detail: "项目文件",
              kind: "file",
              reference: `资料${offset + index}.txt`,
            }),
          ),
          next_cursor:
            offset + pageSize < total ? String(offset + pageSize) : null,
        },
      });
    });
    await page.goto("/tasks/s1");
    await page.locator(".composer textarea").fill("@");
    const picker = page.locator(".context-picker");
    const input = picker.getByRole("textbox", { name: "搜索项目文件" });
    await expect(
      picker.getByRole("tab", { name: "上下文", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(picker.getByRole("option")).toHaveCount(pageSize);
    for (let index = 0; index < pageSize; index++)
      await input.press("ArrowDown");
    await expect(picker.getByRole("option", { selected: true })).toContainText(
      "资料08.txt",
    );
    await expect
      .poll(async () =>
        picker.locator(".context-options").evaluate((el) => el.scrollTop),
      )
      .toBeGreaterThan(0);
    const visible = await picker
      .getByRole("option", { selected: true })
      .evaluate((el) => {
        const row = el.getBoundingClientRect(),
          list = el.parentElement!.getBoundingClientRect();
        return row.top >= list.top && row.bottom <= list.bottom;
      });
    expect(visible).toBe(true);
    expect(cursors).toContain(String(pageSize));
    await picker.locator(".context-options").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      el.dispatchEvent(new Event("scroll"));
    });
    await expect(picker.getByRole("option")).toHaveCount(total);
    expect(cursors).toContain(String(pageSize * 2));
    await picker.getByRole("tab", { name: "专家", exact: true }).click();
    await expect(picker.getByRole("option")).toHaveCount(0);
    await expect(
      picker.getByRole("textbox", { name: "搜索专家" }),
    ).toBeFocused();
    expect(
      await picker
        .getByRole("textbox")
        .evaluate((el) => getComputedStyle(el).boxShadow),
    ).toBe("none");
    await page.locator(".composer textarea").fill("/");
    await expect(
      picker.getByRole("tab", { name: "技能", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await picker.getByRole("tab", { name: "命令", exact: true }).click();
    await expect(picker.getByText("暂无可用命令")).toBeVisible();
  });
}
