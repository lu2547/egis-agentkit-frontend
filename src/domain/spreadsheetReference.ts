/** 单元格引用：约束范围、生成 A1 地址；不处理工作簿文件 IO。 */
export interface CellRange {
  row: number;
  col: number;
  rowCount: number;
  colCount: number;
}
export interface SpreadsheetAnchor {
  sheetName: string;
  ranges: CellRange[];
}
export function normalizeCellRange(
  value: CellRange,
  rows: number,
  cols: number,
  maxCells: number,
): CellRange {
  const row = Math.max(0, value.row),
    col = Math.max(0, value.col);
  const rowCount = Math.min(
    value.rowCount < 0 ? rows : value.rowCount,
    rows - row,
  );
  const colCount = Math.min(
    value.colCount < 0 ? cols : value.colCount,
    cols - col,
  );
  if (rowCount <= 0 || colCount <= 0 || rowCount * colCount > maxCells)
    throw new Error(`选区最多引用 ${maxCells} 个单元格，请缩小范围`);
  return { row, col, rowCount, colCount };
}
export function cellRangeAddress(range: CellRange): string {
  const column = (value: number) => {
    let result = "";
    for (let n = value + 1; n > 0; n = Math.floor((n - 1) / 26))
      result = String.fromCharCode(65 + ((n - 1) % 26)) + result;
    return result;
  };
  const start = `${column(range.col)}${range.row + 1}`;
  const end = `${column(range.col + range.colCount - 1)}${range.row + range.rowCount}`;
  return start === end ? start : `${start}:${end}`;
}
