/** 按框选提取 DOM 文字；二分定位字符范围，避免把整个标题或段落作为选区。 */
import type { PreviewRegion } from "../../domain/previewReferences";
export function extractDOMRegionText(
  source: HTMLElement,
  regions: PreviewRegion[],
  maxChars: number,
  size: { width: number; height: number },
): string {
  const bounds = source.getBoundingClientRect(),
    owner = source.ownerDocument;
  const walker = owner.createTreeWalker(source, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode()))
    if (node.nodeValue?.trim()) nodes.push(node as Text);
  let remaining = maxChars;
  return regions
    .map((region, index) => {
      const box = {
        left: bounds.left + region.x * size.width,
        top: bounds.top + region.y * size.height,
        right: bounds.left + (region.x + region.width) * size.width,
        bottom: bounds.top + (region.y + region.height) * size.height,
      };
      const intersects = (rect: DOMRect) =>
        rect.width > 0 &&
        rect.height > 0 &&
        Math.min(rect.right, box.right) > Math.max(rect.left, box.left) &&
        Math.min(rect.bottom, box.bottom) > Math.max(rect.top, box.top);
      const contains = (rect: DOMRect) =>
        rect.left >= box.left &&
        rect.top >= box.top &&
        rect.right <= box.right &&
        rect.bottom <= box.bottom;
      const pieces: string[] = [];
      for (const text of nodes) {
        if (remaining <= 0) break;
        const range = owner.createRange();
        const select = (start: number, end: number): string => {
          if (remaining <= 0 || start >= end) return "";
          range.setStart(text, start);
          range.setEnd(text, end);
          const rects = Array.from(range.getClientRects());
          if (!rects.some(intersects)) return "";
          if (rects.every(contains) || end - start === 1) {
            const value = text.data.slice(
              start,
              Math.min(end, start + remaining),
            );
            remaining -= value.length;
            return value;
          }
          const middle = Math.floor((start + end) / 2);
          return select(start, middle) + select(middle, end);
        };
        const value = select(0, text.length);
        if (value.trim()) pieces.push(value);
      }
      return `区域 ${index + 1} 文字：\n${pieces.join(" ") || "未提取到可选择的文字，请按框选图片和坐标定位，不要使用框外标题代替。"}`;
    })
    .join("\n\n");
}
