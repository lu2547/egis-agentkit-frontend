import { test, expect } from "@playwright/test";

for (const theme of ["light", "dark"] as const) {
  test(`${theme} personal documents use top file tabs and preserve all three drafts`, async ({
    page,
    request,
  }, testInfo) => {
    await request.post("http://127.0.0.1:38194/__test/reset");
    await page.addInitScript((value) => {
      sessionStorage.setItem("egis_access_token", "test-only");
      localStorage.setItem("pension-gpt-theme", value);
    }, theme);
    let documents = {
      agent_md: "# 工作规范",
      soul_md: "# 角色与风格",
      user_md: "# 关于我",
    };
    await page.route("**/api/manager/preferences", async (route) => {
      if (route.request().method() === "PUT")
        documents = route.request().postDataJSON();
      await route.fulfill({ json: documents });
    });
    await page.goto("/experts?tab=personal");
    await expect(
      page.getByRole("heading", { name: "个人助理", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("设置工作范围、决策风格和业务背景。", { exact: true }),
    ).toHaveCount(0);
    const tabs = page.getByRole("tablist", { name: "个人助理配置文件" });
    const files = ["agent.md", "soul.md", "user.md"];
    const positions = [];
    for (const [index, name] of files.entries()) {
      const tab = tabs.getByRole("tab", {
        name: new RegExp(name.replace(".", "\\.")),
      });
      positions.push(await tab.boundingBox());
      await tab.click();
      const editor = page.getByRole("textbox", { name, exact: true });
      await expect(editor).toHaveCSS("font-size", "17px");
      await editor.fill(`# ${name}\n\n文档 ${index + 1} 的设置`);
      expect((await editor.boundingBox())!.y).toBeGreaterThan(
        positions[0]!.y + positions[0]!.height,
      );
    }
    expect(
      Math.max(...positions.map((p) => p!.y)) -
        Math.min(...positions.map((p) => p!.y)),
    ).toBeLessThan(2);
    await tabs.getByRole("tab").first().click();
    await expect(
      page.getByRole("textbox", { name: "agent.md", exact: true }),
    ).toHaveValue("# agent.md\n\n文档 1 的设置");
    await page.getByRole("button", { name: "保存设置", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("已保存");
    expect(documents.soul_md).toBe("# soul.md\n\n文档 2 的设置");
    expect(documents.user_md).toBe("# user.md\n\n文档 3 的设置");
    await page.reload();
    await expect(
      page.getByRole("textbox", { name: "agent.md", exact: true }),
    ).toHaveValue(documents.agent_md);
    await tabs.getByRole("tab").first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(tabs.getByRole("tab").nth(1)).toBeFocused();
    await expect(
      page.getByRole("textbox", { name: "soul.md", exact: true }),
    ).toHaveValue(documents.soul_md);
    await page.screenshot({
      path: testInfo.outputPath(`personal-documents-${theme}.png`),
    });
  });
}
