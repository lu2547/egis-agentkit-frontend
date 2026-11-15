/** 捕获当前可见预览内容，输出有大小上限的整页标注图。 */
import type {
  PreviewOptions,
  PreviewRegion,
} from "../../domain/previewReferences";
import { extractDOMRegionText } from "./domPreviewText";
const ANNOTATION_STYLE = {
  color: "#ef4444",
  background: "#fff",
  strokeWidthRatio: 400,
  minLabelSize: 12,
  labelSizeRatio: 60,
  labelInsetX: 4,
  labelInsetY: 18,
} as const;

export async function capturePreview(
  node: HTMLElement,
  regions: PreviewRegion[],
  options: PreviewOptions,
): Promise<{ image: string; width: number; height: number; excerpt: string }> {
  const iframe = node.querySelector("iframe");
  const source = iframe?.contentDocument?.documentElement || node;
  const originalCanvas = node.querySelector("canvas");
  const originalImage =
    node.querySelector<HTMLImageElement>("img.preview-image");
  const width =
    originalCanvas?.width || originalImage?.naturalWidth || source.scrollWidth;
  const height =
    originalCanvas?.height ||
    originalImage?.naturalHeight ||
    source.scrollHeight;
  if (!width || !height) throw new Error("页面尚未加载完成，请稍后框选");
  let scale = Math.min(
    1,
    options.maxImageEdge / Math.max(width, height),
    Math.sqrt(options.maxImagePixels / (width * height)),
  );
  let raw: HTMLCanvasElement | HTMLImageElement;
  if (originalCanvas) raw = originalCanvas;
  else if (originalImage) {
    await originalImage.decode();
    raw = originalImage;
  } else {
    const { toCanvas } = await import("html-to-image");
    raw = await toCanvas(source, {
      pixelRatio: scale,
      skipFonts: true,
      fetchRequestInit: {
        mode: "same-origin",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      },
      imagePlaceholder:
        "data:image/svg+xml," +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
        ),
      backgroundColor: getComputedStyle(source).backgroundColor || "#fff",
      width: source.scrollWidth,
      height: source.scrollHeight,
    });
    // DOM 截图已经缩放；后面的统一编码仅处理最终画布尺寸。
    scale = 1;
  }
  const output = document.createElement("canvas");
  output.width = Math.max(1, Math.round(raw.width * scale));
  output.height = Math.max(1, Math.round(raw.height * scale));
  if (raw instanceof HTMLImageElement) {
    output.width = Math.max(1, Math.round(width * scale));
    output.height = Math.max(1, Math.round(height * scale));
  }
  const context = output.getContext("2d");
  if (!context) throw new Error("当前浏览器无法生成引用图片");
  context.fillStyle = ANNOTATION_STYLE.background;
  context.fillRect(0, 0, output.width, output.height);
  context.drawImage(raw, 0, 0, output.width, output.height);
  context.strokeStyle = ANNOTATION_STYLE.color;
  context.lineWidth = Math.max(
    1,
    output.width / ANNOTATION_STYLE.strokeWidthRatio,
  );
  context.font = `${Math.max(ANNOTATION_STYLE.minLabelSize, output.width / ANNOTATION_STYLE.labelSizeRatio)}px sans-serif`;
  regions.forEach((r, i) => {
    context.strokeRect(
      r.x * output.width,
      r.y * output.height,
      r.width * output.width,
      r.height * output.height,
    );
    context.fillStyle = ANNOTATION_STYLE.color;
    context.fillText(
      String(i + 1),
      r.x * output.width + ANNOTATION_STYLE.labelInsetX,
      r.y * output.height + ANNOTATION_STYLE.labelInsetY,
    );
  });
  // PNG 保留文字；复杂页面退为 JPEG，并逐步降低尺寸，使消息负载受控。
  let image = output.toDataURL("image/png");
  if (new Blob([image]).size > options.maxImageBytes) {
    let quality = options.jpegQuality;
    image = output.toDataURL("image/jpeg", quality);
    while (
      new Blob([image]).size > options.maxImageBytes &&
      quality > options.jpegMinQuality
    ) {
      quality = Math.max(
        options.jpegMinQuality,
        quality - options.jpegQualityStep,
      );
      image = output.toDataURL("image/jpeg", quality);
    }
    if (new Blob([image]).size > options.maxImageBytes)
      throw new Error("此页图片过大，请缩小页面后重试");
  }
  return {
    image,
    width,
    height,
    excerpt: (regions.length && !originalCanvas && !originalImage
      ? extractDOMRegionText(source, regions, options.maxExcerptChars, {
          width,
          height,
        })
      : source.innerText || ""
    ).slice(0, options.maxExcerptChars),
  };
}
