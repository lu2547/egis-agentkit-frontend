const pending = new Map<string, string>();
export function queueDraft(sessionId: string, text: string) {
  pending.set(sessionId, text);
}
export function peekDraft(sessionId: string) {
  return pending.get(sessionId);
}
export function takeDraft(sessionId: string) {
  const text = pending.get(sessionId);
  pending.delete(sessionId);
  return text;
}
