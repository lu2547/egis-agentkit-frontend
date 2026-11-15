import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { checkOfficeArchive } from "../src/components/workspace/officeArchive";

function archive(content = "hello") {
  const bytes = zipSync({ "word/document.xml": strToU8(content) });
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}
function central(view: DataView) {
  for (let i = 0; i < view.byteLength - 4; i++)
    if (view.getUint32(i, true) === 0x02014b50) return i;
  throw new Error("missing central directory");
}
describe("office ZIP guard", () => {
  it("uses configured workbook expansion and entry budgets", () => {
    const limits = {
      maxBytes: 10000,
      maxEntries: 4,
      maxEntryBytes: 100,
      maxExpandedBytes: 200,
    };
    expect(() =>
      checkOfficeArchive(archive("a".repeat(101)), limits),
    ).toThrow();
    expect(() =>
      checkOfficeArchive(archive("a".repeat(90)), limits),
    ).not.toThrow();
    expect(() =>
      checkOfficeArchive(archive(), { ...limits, maxEntries: 0 }),
    ).toThrow();
    expect(() =>
      checkOfficeArchive(archive("a".repeat(90)), {
        ...limits,
        maxExpandedBytes: 50,
      }),
    ).toThrow();
  });
  it("accepts ordinary archives", () =>
    expect(() => checkOfficeArchive(archive())).not.toThrow());
  it("rejects encrypted, ZIP64 and oversized entries", () => {
    for (const mutation of [
      (view: DataView, c: number) => view.setUint16(c + 8, 1, true),
      (view: DataView, c: number) => view.setUint32(c + 24, 0xffffffff, true),
      (view: DataView, c: number) =>
        view.setUint32(c + 24, 21 * 1024 * 1024, true),
    ]) {
      const buffer = archive(),
        view = new DataView(buffer);
      mutation(view, central(view));
      expect(() => checkOfficeArchive(buffer)).toThrow();
    }
  });
  it("checks actual expansion even if directory sizes are falsified", () => {
    const buffer = archive("a".repeat(21 * 1024 * 1024)),
      view = new DataView(buffer);
    view.setUint32(central(view) + 24, 1, true);
    expect(() => checkOfficeArchive(buffer)).toThrow();
  });
});
