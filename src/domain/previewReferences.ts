/** 文件引用：统一几何坐标、原生消息及持久化锚点，不改变原文件。 */
import {
  UserMsg,
  type Msg,
  type ContentBlock,
} from "@agentscope-ai/agentscope/message";
import type { WorkspaceArea } from "./workspaceView";
import {
  cellRangeAddress,
  type SpreadsheetAnchor,
} from "./spreadsheetReference";
export interface PreviewRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  note: string;
}
export interface PreviewAnchor {
  id: string;
  projectId: string;
  area: WorkspaceArea;
  path: string;
  checksum: string;
  page: number;
  pageCount: number;
  width: number;
  height: number;
  regions: PreviewRegion[];
  spreadsheet?: SpreadsheetAnchor;
}
/** 草稿确认接收后，预览层才清理尚未发送的标注。 */
export type PreviewAcceptance = (accepted: boolean) => void;
export interface PreviewReference extends PreviewAnchor {
  image: string;
  excerpt: string;
}
export interface ProjectFileReference {
  kind: "file";
  id: string;
  projectId: string;
  path: string;
  name: string;
}
export type ChatReference = PreviewReference | ProjectFileReference;

export function isProjectFileReference(
  ref: PreviewAnchor | ProjectFileReference,
): ref is ProjectFileReference {
  return "kind" in ref && ref.kind === "file";
}
export interface PreviewOptions {
  maxCount: number;
  maxTotalBytes: number;
  maxImageBytes: number;
  maxImagePixels: number;
  maxImageEdge: number;
  maxRegions: number;
  minRegionPixels: number;
  maxExcerptChars: number;
  maxNoteChars: number;
  captureTimeoutMs: number;
  jpegQuality: number;
  jpegMinQuality: number;
  jpegQualityStep: number;
}
export const isPreviewImage = (path: string, mime: string) =>
  /\.(svg|png|jpe?g|gif|webp|bmp|avif)$/i.test(path) ||
  /^image\/(svg\+xml|png|jpeg|gif|webp|bmp|avif)$/.test(mime);
export function normalizeRegion(
  a: { x: number; y: number },
  b: { x: number; y: number },
  size: { width: number; height: number },
) {
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const x = clamp(Math.min(a.x, b.x) / size.width),
    y = clamp(Math.min(a.y, b.y) / size.height);
  return {
    x,
    y,
    width: clamp(Math.max(a.x, b.x) / size.width) - x,
    height: clamp(Math.max(a.y, b.y) / size.height) - y,
  };
}
export function validateReferenceBudget(
  refs: PreviewReference[],
  options: Pick<PreviewOptions, "maxCount" | "maxTotalBytes">,
) {
  if (refs.length > options.maxCount)
    throw new Error(`每条消息最多引用 ${options.maxCount} 个页面`);
  // 按实际 JSON UTF-8 字节计量，包含 base64、备注和坐标，而不是只计原始图片。
  if (
    new TextEncoder().encode(JSON.stringify(refs)).length >
    options.maxTotalBytes
  )
    throw new Error("引用图片总大小超过限制，请减少引用页面或框选范围");
}
export function getReferenceLabel(ref: PreviewAnchor | ProjectFileReference) {
  if (isProjectFileReference(ref)) return ref.name;
  if (ref.spreadsheet)
    return `${ref.path.split("/").pop()} · ${ref.spreadsheet.sheetName} · ${ref.spreadsheet.ranges.map(cellRangeAddress).join(", ")}`;
  return `${ref.path.split("/").pop()} · 第 ${ref.page} / ${ref.pageCount} 页`;
}
export function createReferenceMessage(
  text: string,
  refs: ChatReference[],
): Msg {
  if (!refs.length) return UserMsg({ name: "user", content: text });
  const files = refs.filter(isProjectFileReference);
  const previews = refs.filter(
    (ref): ref is PreviewReference => !isProjectFileReference(ref),
  );
  const created_at = new Date().toISOString();
  const details = refs
    .map((ref) => {
      if (isProjectFileReference(ref)) return `【项目文件：${ref.path}】`;
      return (
        `【文件引用：${ref.path}；${ref.area}；${ref.spreadsheet ? getReferenceLabel(ref) : `第 ${ref.page} / ${ref.pageCount} 页`}；SHA-256=${ref.checksum}】\n` +
        ref.regions
          .map(
            (r, i) =>
              `区域 ${i + 1}（归一化坐标 x=${r.x.toFixed(4)}, y=${r.y.toFixed(4)}, width=${r.width.toFixed(4)}, height=${r.height.toFixed(4)}）${r.note ? "：" + r.note : ""}`,
          )
          .join("\n") +
        (ref.excerpt
          ? `\n${ref.regions.length ? "框选区域文字" : "页面文本"}（可能截断）：\n${ref.excerpt}`
          : "") +
        (ref.regions.length
          ? "\n用户所说的“这里／这句话／这部分”指上述框选区域。修改前按区域坐标与区域文字核对对象；不要把框外标题或整页第一句话当作选中内容。"
          : "")
      );
    })
    .join("\n\n");
  const content: ContentBlock[] = [
    {
      id: crypto.randomUUID(),
      type: "text",
      text: [text, details].filter(Boolean).join("\n\n"),
      created_at,
    },
  ];
  for (const ref of previews) {
    const matched = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(
      ref.image,
    );
    if (!matched) throw new Error("引用图片格式无效，请重新框选");
    content.push({
      id: ref.id,
      type: "data",
      name: getReferenceLabel(ref),
      source: {
        type: "base64",
        media_type: `image/${matched[1]}`,
        data: matched[2]!,
      },
      created_at,
    });
  }
  return UserMsg({
    name: "user",
    content,
    metadata: {
      preview_prompt: text,
      preview_references: JSON.parse(
        JSON.stringify(previews.map(({ image, excerpt, ...anchor }) => anchor)),
      ),
      ...(files.length
        ? { project_file_references: files.map((file) => ({ ...file })) }
        : {}),
    },
  });
}

/** 恢复消息引用的项目文件路径和显示名。 */
export function getMessageProjectFiles(message: Msg): ProjectFileReference[] {
  const files = message.metadata?.project_file_references;
  if (!Array.isArray(files)) return [];
  return files.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const file = value as unknown as ProjectFileReference;
    if (
      file.kind !== "file" ||
      typeof file.id !== "string" ||
      typeof file.projectId !== "string" ||
      typeof file.path !== "string" ||
      typeof file.name !== "string"
    )
      return [];
    return [file];
  });
}
/** 历史消息只信任符合当前引用结构的 metadata；普通附件继续使用原有展示。 */
export function getMessageReferences(message: Msg): PreviewReference[] {
  const anchors = message.metadata?.preview_references;
  if (!Array.isArray(anchors)) return [];
  return anchors.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const a = value as unknown as PreviewAnchor;
    if (
      typeof a.id !== "string" ||
      typeof a.projectId !== "string" ||
      typeof a.path !== "string" ||
      !["uploads", "work", "artifacts"].includes(a.area) ||
      !Number.isInteger(a.page) ||
      a.page < 1 ||
      !Array.isArray(a.regions)
    )
      return [];
    const block = message.content.find(
      (b) => b.type === "data" && b.id === a.id,
    );
    if (
      !block ||
      block.type !== "data" ||
      block.source.type !== "base64" ||
      !["image/png", "image/jpeg"].includes(block.source.media_type)
    )
      return [];
    return [
      {
        ...a,
        image: `data:${block.source.media_type};base64,${block.source.data}`,
        excerpt: "",
      },
    ];
  });
}
