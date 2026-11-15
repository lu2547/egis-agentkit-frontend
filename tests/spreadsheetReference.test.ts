import { expect, it } from "vitest";
import {
  normalizeCellRange,
  cellRangeAddress,
} from "../src/domain/spreadsheetReference";
import {
  createReferenceMessage,
  getMessageReferences,
  getReferenceLabel,
} from "../src/domain/previewReferences";

it("bounds whole-column selection and rejects excessive cell references", () => {
  expect(
    normalizeCellRange(
      { row: -1, col: 1, rowCount: -1, colCount: 2 },
      10,
      8,
      30,
    ),
  ).toEqual({ row: 0, col: 1, rowCount: 10, colCount: 2 });
  expect(() =>
    normalizeCellRange(
      { row: -1, col: -1, rowCount: -1, colCount: -1 },
      1000,
      1000,
      2000,
    ),
  ).toThrow("选区");
  expect(cellRangeAddress({ row: 4, col: 25, rowCount: 2, colCount: 3 })).toBe(
    "Z5:AB6",
  );
});
it("keeps worksheet and cell ranges in the native message and history anchor", () => {
  const ref = {
    id: "cells",
    projectId: "p",
    area: "artifacts" as const,
    path: "book.xlsx",
    checksum: "sha",
    page: 2,
    pageCount: 3,
    width: 400,
    height: 100,
    regions: [],
    image: "data:image/png;base64,YQ==",
    excerpt: "B5=100\nB6=200（公式：SUM(B1:B4)）",
    spreadsheet: {
      sheetName: "财务",
      ranges: [{ row: 4, col: 1, rowCount: 2, colCount: 1 }],
    },
  };
  const msg = createReferenceMessage("检查这里", [ref]);
  expect(getReferenceLabel(ref)).toContain("财务 · B5:B6");
  expect(msg.content[0]).toMatchObject({
    text: expect.stringContaining("财务 · B5:B6"),
  });
  expect(getMessageReferences(msg)[0]?.spreadsheet).toEqual(ref.spreadsheet);
});
