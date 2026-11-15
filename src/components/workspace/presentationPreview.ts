/** 本地预览页序仅改善等待期间的显示；完整服务端排版就绪后才开放引用。 */
import { PDFDocument } from "pdf-lib";

export async function buildPresentationPreview(
  bytes: Uint8Array,
  previousIds: string[],
  nextIds: string[],
  patch?: { id: string; bytes: Uint8Array },
  copiedSlide?: { id: string; sourceId: string },
): Promise<Uint8Array> {
  const original = await PDFDocument.load(bytes);
  if (original.getPageCount() !== previousIds.length)
    throw new Error("预览页面与目录不一致");
  const output = await PDFDocument.create();
  const positions = new Map(previousIds.map((id, index) => [id, index]));
  const sourcePages = await output.copyPages(
    original,
    original.getPageIndices(),
  );
  const patchDoc = patch ? await PDFDocument.load(patch.bytes) : undefined;
  if (patchDoc && patchDoc.getPageCount() !== 1)
    throw new Error("单页预览结果不正确");
  const replacement = patchDoc
    ? (await output.copyPages(patchDoc, [0]))[0]
    : undefined;
  const size = original.getPage(0).getSize();
  for (const id of nextIds) {
    if (patch?.id === id && replacement) output.addPage(replacement);
    else {
      const index =
        positions.get(id) ??
        (copiedSlide?.id === id
          ? positions.get(copiedSlide.sourceId)
          : undefined);
      if (index !== undefined) {
        const page =
          copiedSlide?.id === id
            ? (await output.copyPages(original, [index]))[0]!
            : sourcePages[index]!;
        output.addPage(page);
      } else output.addPage([size.width, size.height]);
    }
  }
  return output.save();
}
