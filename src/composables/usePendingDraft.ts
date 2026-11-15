import type { PreviewReference } from "../domain/previewReferences";
const pending = new Map<
  string,
  { text: string; references: PreviewReference[] }
>();
export function queueDraft(
  sessionId: string,
  text: string,
  references: PreviewReference[] = [],
) {
  pending.set(sessionId, { text, references });
}
export function peekDraft(sessionId: string) {
  return pending.get(sessionId);
}
export function takeDraft(sessionId: string) {
  const text = pending.get(sessionId);
  pending.delete(sessionId);
  return text;
}
