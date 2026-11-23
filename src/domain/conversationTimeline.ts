import type { Msg } from "@agentscope-ai/agentscope/message";
import type { CollaboratorProgress } from "../types/api";

export type ConversationTimelineItem =
  | { kind: "message"; id: string; created_at?: string; message: Msg }
  | {
      kind: "collaborator";
      id: string;
      created_at?: string;
      progress: CollaboratorProgress;
      stage: "started" | "finished";
    };

export function conversationTimeline(
  messages: Msg[],
  collaborators: CollaboratorProgress[] = [],
): ConversationTimelineItem[] {
  const work: ConversationTimelineItem[] = [];
  for (const progress of collaborators) {
    work.push({
      kind: "collaborator",
      id: `${progress.worker_session_id}:started`,
      created_at: progress.started_at,
      progress,
      stage: "started",
    });
    if (["completed", "failed", "interrupted"].includes(progress.status)) {
      work.push({
        kind: "collaborator",
        id: `${progress.worker_session_id}:finished`,
        created_at: progress.finished_at,
        progress,
        stage: "finished",
      });
    }
  }
  const time = (item: { created_at?: string }) =>
    item.created_at ? Date.parse(item.created_at) : Infinity;
  work.sort((a, b) => time(a) - time(b));
  const items: ConversationTimelineItem[] = [];
  let cursor = 0;
  // Native history includes steering messages in injection order; preserve it.
  for (const message of messages) {
    while (cursor < work.length && time(work[cursor]!) < time(message)) {
      items.push(work[cursor++]!);
    }
    items.push({ kind: "message", id: message.id, message });
  }
  return [...items, ...work.slice(cursor)];
}
