import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { buildPresentationPreview } from "../src/components/workspace/presentationPreview";
it("reorders old rendered slides by stable ID and inserts an explicit blank pending page", async () => {
  const bytes = readFileSync("tests/fixtures/preview.pdf");
  const original = await PDFDocument.load(bytes);
  const result = await buildPresentationPreview(
    new Uint8Array(bytes),
    ["a", "b"],
    ["b", "new", "a"],
  );
  const doc = await PDFDocument.load(result);
  expect(doc.getPageCount()).toBe(3);
  expect(doc.getPage(1).getSize()).toEqual(original.getPage(0).getSize());
  expect(doc.getPage(0).node.Contents()?.toString()).toBeDefined();
  expect(doc.getPage(1).node.Contents()).toBeUndefined();
});
it("replaces only the newly inserted page with the actual one-page render", async () => {
  const bytes = readFileSync("tests/fixtures/preview.pdf");
  const patch = await PDFDocument.create();
  patch.addPage([333, 222]);
  const result = await buildPresentationPreview(
    new Uint8Array(bytes),
    ["a", "b"],
    ["a", "new", "b"],
    { id: "new", bytes: await patch.save() },
  );
  const doc = await PDFDocument.load(result);
  expect(doc.getPageCount()).toBe(3);
  expect(doc.getPage(1).getSize()).toEqual({ width: 333, height: 222 });
});
