import { it, expect } from "vitest";
import { extractRegionText, pdfTextFragment } from "../src/domain/previewText";

it("extracts only text inside selected PDF/PPT regions, never the heading outside", () => {
  const fragments = [
    {
      text: "方案理念 迎接数据智能浪潮",
      x: 0.1,
      y: 0.05,
      width: 0.85,
      height: 0.04,
    },
    {
      text: "存储服务化建设，从思维方式和管理方法进行转型升级。",
      x: 0.18,
      y: 0.16,
      width: 0.7,
      height: 0.03,
    },
    {
      text: "实现从被动响应到主动预测的转变。",
      x: 0.18,
      y: 0.22,
      width: 0.7,
      height: 0.03,
    },
    { text: "图表数据", x: 0.2, y: 0.55, width: 0.5, height: 0.1 },
  ];
  const text = extractRegionText(fragments, [
    { id: "body", x: 0.1659, y: 0.1344, width: 0.7999, height: 0.17, note: "" },
  ]);
  expect(text).toContain("存储服务化建设");
  expect(text).toContain("主动预测");
  expect(text).not.toContain("迎接数据智能");
  expect(text).not.toContain("图表数据");
});
it("maps PDF baseline coordinates to normalized top-left text boxes", () => {
  const fragment = pdfTextFragment(
    { str: "text", width: 400, transform: [20, 0, 0, 20, 100, 900] },
    { width: 1000, height: 1000, transform: [1, 0, 0, -1, 0, 1000] },
  );
  expect(fragment).toEqual({
    text: "text",
    x: 0.1,
    y: 0.08,
    width: 0.4,
    height: 0.02,
  });
});
it("does not fall back to full-page text when a frame contains no selectable text", () => {
  expect(
    extractRegionText(
      [{ text: "outside", x: 0, y: 0, width: 0.1, height: 0.1 }],
      [{ id: "blank", x: 0.5, y: 0.5, width: 0.2, height: 0.2, note: "" }],
    ),
  ).not.toContain("outside");
});
