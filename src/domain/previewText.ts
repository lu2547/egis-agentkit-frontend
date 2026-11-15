/** 按页面几何位置筛选引用文字，禁止把框外标题当作框内正文。 */
import type { PreviewRegion } from "./previewReferences";
export interface PreviewTextFragment {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
export function extractRegionText(
  fragments: PreviewTextFragment[],
  regions: PreviewRegion[],
): string {
  if (!regions.length) return fragments.map((item) => item.text).join(" ");
  return regions
    .map((region, index) => {
      const selected = fragments.filter(
        (item) =>
          Math.min(item.x + item.width, region.x + region.width) >
            Math.max(item.x, region.x) &&
          Math.min(item.y + item.height, region.y + region.height) >
            Math.max(item.y, region.y),
      );
      return `区域 ${index + 1} 文字：\n${selected.length ? selected.map((item) => item.text).join(" ") : "未提取到可选择的文字；请根据框选图片和坐标定位，不要用框外标题代替。"}`;
    })
    .join("\n\n");
}
export function pdfTextFragment(
  item: { str: string; width: number; transform: number[] },
  viewport: { transform: number[]; width: number; height: number },
): PreviewTextFragment {
  // PDF 文本矩阵先转到页面左上角坐标，基线和字高共同确定包围框；支持旋转页面。
  const a = viewport.transform,
    b = item.transform;
  const matrix = [
    a[0]! * b[0]! + a[2]! * b[1]!,
    a[1]! * b[0]! + a[3]! * b[1]!,
    a[0]! * b[2]! + a[2]! * b[3]!,
    a[1]! * b[2]! + a[3]! * b[3]!,
    a[0]! * b[4]! + a[2]! * b[5]! + a[4]!,
    a[1]! * b[4]! + a[3]! * b[5]! + a[5]!,
  ];
  const advance = Math.hypot(matrix[0]!, matrix[1]!) || 1;
  const scale = Math.hypot(a[0]!, a[1]!);
  const dx = (matrix[0]! * item.width * scale) / advance,
    dy = (matrix[1]! * item.width * scale) / advance;
  const xs = [
    matrix[4]!,
    matrix[4]! + dx,
    matrix[4]! + matrix[2]!,
    matrix[4]! + dx + matrix[2]!,
  ];
  const ys = [
    matrix[5]!,
    matrix[5]! + dy,
    matrix[5]! + matrix[3]!,
    matrix[5]! + dy + matrix[3]!,
  ];
  return {
    text: item.str,
    x: Math.min(...xs) / viewport.width,
    y: Math.min(...ys) / viewport.height,
    width: (Math.max(...xs) - Math.min(...xs)) / viewport.width,
    height: (Math.max(...ys) - Math.min(...ys)) / viewport.height,
  };
}
