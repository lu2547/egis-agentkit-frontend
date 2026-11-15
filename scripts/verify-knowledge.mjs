/** 对独立运行环境执行真实模型、原生聊天/SSE、历史恢复和右侧来源的浏览器验收。 */
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const frontend = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const root = path.dirname(frontend);
const runtime = path.join(root, ".runtime");
const state = JSON.parse(
  fs.readFileSync(path.join(runtime, "state.json"), "utf8"),
);
const baseIndex = process.argv.indexOf("--base-env");
const baseEnv =
  baseIndex >= 0 ? process.argv[baseIndex + 1] : process.env.AGENTKIT_BASE_ENV;
if (!baseEnv) throw new Error("请用 --base-env 指定现有开发环境文件");
const resumeIndex = process.argv.indexOf("--resume-session");
const resumeSession = resumeIndex >= 0 ? process.argv[resumeIndex + 1] : "";
const python = process.env.AGENTKIT_PYTHON || "python";
const timeout = Number(process.env.KB_ACCEPTANCE_TIMEOUT_MS || 180000);
const pythonSetup = `
import asyncio,json,os,sys
import httpx
from dotenv import load_dotenv
from egis_agentkit.client.nacos import NacosClient,NacosConfigProvider,nacos_bootstrap
async def main():
    load_dotenv(sys.argv[1])
    async with NacosClient(nacos_bootstrap().model_copy(update={'group':sys.argv[3]})) as nacos:
        settings=await NacosConfigProvider(nacos).refresh()
    async with httpx.AsyncClient(base_url=sys.argv[2],timeout=30) as client:
        login=await client.post('/auth/login',json={'user_id':'demo.user','password':os.environ[settings.user.identity.demo_password_env]})
        assert login.status_code==200,('login',login.status_code)
        token=login.json()['access_token']
        client.headers['Authorization']='Bearer '+token
        assistant=(await client.get('/manager/assistant')).json()
        projects=(await client.get('/manager/projects')).json()['items']
        project=next((p for p in projects if p['project_name']=='知识库接入验收'),None)
        if project is None:
            response=await client.post('/manager/projects',json={'project_name':'知识库接入验收'})
            assert response.status_code==201,response.text
            project=response.json()
        if sys.argv[4]:
            response=await client.get('/manager/tasks/'+sys.argv[4])
            assert response.status_code==200,response.text
        else:
            response=await client.post('/manager/tasks',json={'definition_id':assistant['id'],'resource_view_type':'private','project_id':project['id'],'name':'知识库认证与版本溯源'})
            assert response.status_code==201,response.text
        task=response.json()
        empty=await client.post('/manager/tasks',json={'definition_id':assistant['id'],'resource_view_type':'private','project_id':project['id'],'name':'知识库会话隔离验收'})
        assert empty.status_code==201,empty.text
        print(json.dumps({'token':token,'task':task,'empty_task':empty.json()}))
asyncio.run(main())
`;
// 凭证仅经子进程管道进入浏览器，不输出到日志或验收报告。
const setup = JSON.parse(
  execFileSync(
    python,
    ["-c", pythonSetup, baseEnv, state.api_url, state.group, resumeSession],
    {
      env: {
        ...process.env,
        PYTHONPATH: [
          path.join(root, "framework/src"),
          path.join(root, "app/src"),
        ].join(path.delimiter),
      },
      encoding: "utf8",
    },
  ),
);
const artifacts = path.join(runtime, "acceptance");
fs.mkdirSync(artifacts, { recursive: true, mode: 0o700 });
const browser = await chromium.launch({
  executablePath:
    process.env.KB_CHROME ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1536, height: 1100 },
  colorScheme: "light",
});
await context.addInitScript(
  (token) => sessionStorage.setItem("egis_access_token", token),
  setup.token,
);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const report = {
  mode: state.mode,
  url: state.frontend_url + "/tasks/" + setup.task.session_id,
  session_id: setup.task.session_id,
  automatic_tool_call: false,
};
try {
  await page.goto(report.url, { waitUntil: "domcontentloaded", timeout });
  if (!resumeSession) {
    await page
      .getByPlaceholder("今天帮你做些什么？@ 添加上下文，/调用技能与指令。")
      .fill(
        "这套知识库服务的 Java 接口如何认证？文档的历史版本和版本正文分别存在哪些表？请结合文档说明。",
      );
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
  }
  await page
    .locator(".reply-knowledge-sources button")
    .first()
    .waitFor({ timeout });
  await page.locator(".reply-actions").last().waitFor({ timeout });
  assert.equal(
    await page.locator(".reply-knowledge-sources button").count(),
    2,
  );
  assert.equal(
    await page.locator(".knowledge-document-list button").count(),
    2,
  );
  const answer = await page
    .locator(".assistant-content .markdown")
    .last()
    .innerText();
  assert.match(answer, /HMAC|Cookie/i);
  assert.match(answer, /llm_document_version/);
  if (!resumeSession)
    assert.match(answer, /version_id/, "关联字段必须遵守建表文档");
  report.automatic_tool_call = true;
  report.source_documents = 2;
  report.inline_citations = await page.locator(".knowledge-citation").count();
  assert.ok(report.inline_citations > 0, "回答应包含可以定位右侧来源的引用");
  await page.locator(".reply-knowledge-sources button").first().click();
  await page
    .getByRole("heading", { name: "Java 接口规范（验收资料）", exact: true })
    .waitFor();
  await page.screenshot({ path: path.join(artifacts, "knowledge-light.png") });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(artifacts, "knowledge-dark.png") });
  await page.emulateMedia({ colorScheme: "light" });
  // Cookie 鉴权失败不能清空平台登录，也不能向 Java 发送平台 Bearer。
  await page.getByRole("button", { name: "查看当前原文" }).click();
  await page.getByRole("alert").filter({ hasText: "请先登录知识库" }).waitFor();
  assert.ok(
    await page.evaluate(() => sessionStorage.getItem("egis_access_token")),
  );
  await context.request.get(
    state.frontend_url + "/knowledge/__contract/login",
    { maxRedirects: 0 },
  );
  await page.getByRole("button", { name: "查看当前原文" }).click();
  await page.locator(".knowledge-original-frame").waitFor();
  assert.match(
    await page.locator(".knowledge-original-frame").getAttribute("src"),
    /doc_api/,
  );
  report.original_document_authenticated = true;
  await page.screenshot({
    path: path.join(artifacts, "knowledge-original.png"),
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".reply-knowledge-sources button").first().waitFor();
  assert.equal(
    await page.locator(".reply-knowledge-sources button").count(),
    2,
  );
  report.history_replay_verified = true;
  await page.setViewportSize({ width: 390, height: 844 });
  const closeWorkspace = page.getByRole("button", {
    name: "关闭工作空间",
    exact: true,
  });
  if (await closeWorkspace.isVisible()) await closeWorkspace.click();
  await page.locator(".reply-knowledge-sources button").first().click();
  await page.locator(".knowledge-panel").waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const panel = document.querySelector(".workspace-panel");
    return (
      panel &&
      !panel.hasAttribute("aria-hidden") &&
      !/workspace-(enter|leave)/.test(panel.className) &&
      getComputedStyle(panel).opacity === "1"
    );
  });
  const panelBounds = await page.locator(".workspace-panel").boundingBox();
  assert.ok(
    panelBounds &&
      panelBounds.x >= -1 &&
      panelBounds.x + panelBounds.width <= 391,
    "来源面板应完整显示在窄屏范围内",
  );
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  assert.ok(
    dimensions.width <= dimensions.viewport + 1,
    "窄屏不应发生整页横向溢出",
  );
  await page.screenshot({ path: path.join(artifacts, "knowledge-mobile.png") });
  report.mobile_source_panel_verified = true;
  await page.goto(
    state.frontend_url + "/tasks/" + setup.empty_task.session_id,
    { waitUntil: "domcontentloaded" },
  );
  await page
    .getByRole("heading", { name: "知识库会话隔离验收", exact: true })
    .waitFor();
  assert.equal(
    await page.locator(".reply-knowledge-sources button").count(),
    0,
  );
  assert.equal(
    await page.locator(".knowledge-document-list button").count(),
    0,
  );
  report.cross_session_sources_cleared = true;
  assert.deepEqual(errors, []);
  report.page_errors = errors;
  await page.setViewportSize({ width: 1536, height: 1100 });
  await page.goto(state.frontend_url + "/knowledge-bases", {
    waitUntil: "domcontentloaded",
  });
  await page
    .getByRole("heading", { name: "接口契约验收库", exact: true })
    .waitFor();
  await page.screenshot({
    path: path.join(artifacts, "knowledge-catalog.png"),
  });
  report.authorized_catalog_verified = true;
  // 清理临时空会话后重拍最终效果，交付截图只保留可复用的有效问答。
  const cleanup = await context.request.delete(
    state.frontend_url + "/api/manager/tasks/" + setup.empty_task.session_id,
    { headers: { Authorization: "Bearer " + setup.token } },
  );
  assert.equal(cleanup.status(), 204);
  await page.goto(report.url, { waitUntil: "domcontentloaded" });
  await page.locator(".reply-knowledge-sources button").first().click();
  await page
    .getByRole("heading", { name: "Java 接口规范（验收资料）", exact: true })
    .waitFor();
  await page.screenshot({ path: path.join(artifacts, "knowledge-light.png") });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: path.join(artifacts, "knowledge-dark.png") });
  const knowledgeUrl = state.knowledge_url;
  const health = await (
    await fetch(knowledgeUrl + "/__contract/health")
  ).json();
  report.contract_queries = health.query_requests;
  assert.ok(health.query_requests > 0);
  fs.writeFileSync(
    path.join(artifacts, "report.json"),
    JSON.stringify(report, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await page
    .screenshot({ path: path.join(artifacts, "failure.png") })
    .catch(() => {});
  console.error(error.message);
  throw error;
} finally {
  await context.request
    .delete(
      state.frontend_url + "/api/manager/tasks/" + setup.empty_task.session_id,
      { headers: { Authorization: "Bearer " + setup.token } },
    )
    .catch(() => {});
  await browser.close();
}
