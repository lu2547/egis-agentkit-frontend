import { test, expect } from "@playwright/test";
const html = `<!doctype html><html><head><style>body{margin:0;background:#171e3c;color:#ffd25f;font-family:sans-serif}main{display:flex;gap:20px;padding:20px;min-width:540px;box-sizing:border-box}canvas{background:#090c20}button{background:#c72452;color:white;border:0;padding:14px}</style></head><body><main><canvas id="board" width="200" height="300"></canvas><section><h1>游戏预览</h1><p id="score">0</p><button id="start">开始游戏</button><p id="isolation"></p></section></main><script>const ctx=document.getElementById('board').getContext('2d');ctx.fillStyle='#00c9e8';ctx.fillRect(20,20,80,40);document.getElementById('start').onclick=()=>{document.getElementById('score').textContent='10';ctx.fillRect(20,100,80,40)};try{parent.document.body.dataset.previewEscaped='yes'}catch{document.getElementById('isolation').textContent='parent blocked'};try{localStorage.getItem('egis_access_token');document.getElementById('isolation').textContent='storage accessible'}catch{}</script></body></html>`;
test("HTML preserves styles, canvas and interaction in an isolated frame and still quotes", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:38194/__test/reset");
  await page.addInitScript(() =>
    sessionStorage.setItem("egis_access_token", "test-only"),
  );
  await page.route("**/api/manager/projects/project-1/files**", (r) =>
    r.fulfill({
      json: {
        items: [
          {
            name: "game.html",
            path: "game.html",
            size: html.length,
            is_directory: false,
          },
        ],
      },
    }),
  );
  await page.route("**/api/manager/projects/project-1/file?**", (r) =>
    r.fulfill({ body: html, contentType: "text/html" }),
  );
  await page.goto("/tasks/s1");
  await page
    .locator("button.file-open")
    .filter({ hasText: "game.html" })
    .click();
  const frame = page.frameLocator("iframe.html-preview");
  await expect(frame.locator("body")).toHaveCSS(
    "background-color",
    "rgb(23, 30, 60)",
  );
  await expect(frame.locator("#isolation")).toHaveText("parent blocked");
  await expect(page.locator("iframe.html-preview")).toHaveAttribute(
    "sandbox",
    "allow-scripts",
  );
  expect(
    await frame
      .locator("#board")
      .evaluate((c: HTMLCanvasElement) => [
        ...c.getContext("2d")!.getImageData(30, 30, 1, 1).data,
      ]),
  ).toEqual([0, 201, 232, 255]);
  await frame.getByRole("button", { name: "开始游戏" }).click();
  await expect(frame.locator("#score")).toHaveText("10");
  expect(
    await page.locator("body").getAttribute("data-preview-escaped"),
  ).toBeNull();
  const originalWidth = (await page
    .locator("iframe.html-preview")
    .boundingBox())!.width;
  for (let i = 0; i < 6; i++)
    await page
      .getByRole("separator", { name: "调整工作区宽度" })
      .press("ArrowLeft");
  await expect
    .poll(
      async () =>
        (await page.locator("iframe.html-preview").boundingBox())!.width,
    )
    .toBeGreaterThan(originalWidth);
  await page.getByRole("button", { name: "加入对话", exact: true }).click();
  await expect(page.locator(".composer .preview-reference-card")).toHaveCount(
    1,
  );
  await expect(
    page.locator(".composer .preview-reference-card img"),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/agentkit-html-interactive-test.png" });
});
