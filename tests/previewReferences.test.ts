import { describe, expect, it } from "vitest";
import {
  isPreviewImage,
  normalizeRegion,
  createReferenceMessage,
  validateReferenceBudget,
} from "../src/domain/previewReferences";

describe("preview references", () => {
  it("recognizes SVG before generic text or octet-stream handling", () => {
    expect(isPreviewImage("chart.svg", "text/plain")).toBe(true);
    expect(isPreviewImage("chart", "image/svg+xml")).toBe(true);
    expect(isPreviewImage("script.js", "text/plain")).toBe(false);
  });
  it("normalizes reverse drags and clamps regions to source bounds", () => {
    const region = normalizeRegion(
      { x: 120, y: 80 },
      { x: -10, y: 20 },
      { width: 100, height: 100 },
    );
    expect(region).toMatchObject({ x: 0, y: 0.2, width: 1 });
    expect(region.height).toBeCloseTo(0.6);
  });
  const reference = {
    id: "ref-1",
    projectId: "project-1",
    area: "uploads" as const,
    path: "deck.pptx",
    checksum: "abc",
    page: 2,
    pageCount: 3,
    width: 800,
    height: 600,
    regions: [
      { id: "r1", x: 0.1, y: 0.2, width: 0.4, height: 0.3, note: "核对标题" },
    ],
    image: "data:image/png;base64,aGVsbG8=",
    excerpt: "页面内容",
  };
  it("serializes an image once and stores stable source anchors in native metadata", () => {
    const message = createReferenceMessage("修改这里", [reference]);
    expect(message.content.find((b) => b.type === "data")).toMatchObject({
      id: "ref-1",
      source: { type: "base64", media_type: "image/png", data: "aGVsbG8=" },
    });
    expect(JSON.stringify(message.metadata)).not.toContain("aGVsbG8");
    expect(message.metadata?.preview_references).toMatchObject([
      {
        path: "deck.pptx",
        page: 2,
        checksum: "abc",
        regions: [{ note: "核对标题" }],
      },
    ]);
    expect(message.content.find((b) => b.type === "text")).toMatchObject({
      text: expect.stringContaining("第 2 / 3 页"),
    });
  });
  it("rejects excessive references before creating a request", () => {
    expect(() =>
      validateReferenceBudget([reference, reference], {
        maxCount: 1,
        maxTotalBytes: 10000,
      }),
    ).toThrow("最多");
    expect(() =>
      validateReferenceBudget([reference], { maxCount: 3, maxTotalBytes: 1 }),
    ).toThrow("大小");
  });
});
