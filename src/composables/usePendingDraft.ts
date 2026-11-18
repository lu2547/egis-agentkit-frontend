import type { ChatReference } from "../domain/previewReferences";
const pending = new Map<
  string,
  { text: string; references: ChatReference[] }
>();
export function queueDraft(
  sessionId: string,
  text: string,
  references: ChatReference[] = [],
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
