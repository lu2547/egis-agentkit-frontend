import { createReferenceMessage, type ChatReference } from "../domain/previewReferences";
import type { Msg } from "@agentscope-ai/agentscope/message";
import type { Task } from "../types/api";
const pending = new Map<
  string,
  {
    task: Task;
    text: string;
    references: ChatReference[];
    message: Msg;
    workspaceOpen: boolean;
  }
>();
export function queueDraft(
  task: Task,
  text: string,
  references: ChatReference[],
  workspaceOpen: boolean,
) {
  pending.set(task.session_id, {
    task,
    text,
    references,
    message: createReferenceMessage(text, references),
    workspaceOpen,
  });
}
export function peekDraft(sessionId: string) {
  return pending.get(sessionId);
}
export function takeDraft(sessionId: string) {
  const text = pending.get(sessionId);
  pending.delete(sessionId);
  return text;
}
