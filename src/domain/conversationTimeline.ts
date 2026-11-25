import type { Msg } from "@agentscope-ai/agentscope/message";
import type { CollaboratorProgress } from "../types/api";
import { STEERING_SOURCE, steeringState } from "./steering";

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
  const replies = new Set(messages.filter(message => message.role === "assistant").map(message => message.id));
  const steeringByHint = new Map<string, Msg>();
  const targetReplies = new Map<string, string>();
  for (const message of messages) {
    if (message.role !== "user" || !steeringState(message)) continue;
    steeringByHint.set(message.id, message);
    const delivery = message.metadata.agentkit_delivery;
    if (!delivery || typeof delivery !== "object" || Array.isArray(delivery)) continue;
    if (typeof delivery.hint_id === "string") steeringByHint.set(delivery.hint_id, message);
    if (typeof delivery.reply_id === "string" && replies.has(delivery.reply_id))
      targetReplies.set(message.id, delivery.reply_id);
  }
  // The persisted HintBlock identifies the containing reply even after reload.
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const block of message.content) {
      if (block.type !== "hint" || block.source !== STEERING_SOURCE) continue;
      const steering = steeringByHint.get(block.id);
      if (steering) targetReplies.set(steering.id, message.id);
    }
  }
  const guidanceBeforeReply = new Map<string, ConversationTimelineItem[]>();
  for (const message of messages) {
    const target = targetReplies.get(message.id);
    if (!target) continue;
    const entries = guidanceBeforeReply.get(target) || [];
    entries.push({ kind: "message", id: message.id, message });
    guidanceBeforeReply.set(target, entries);
  }
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
  const beforeReply = new Map<string, ConversationTimelineItem[]>();
  const betweenMessages: ConversationTimelineItem[] = [];
  for (const item of work) {
    const stamp = time(item);
    // Keep work occurring during a reply above it, away from its growing text.
    const reply = Number.isFinite(stamp)
      ? messages.find(message =>
          message.role === "assistant" &&
          time(message) <= stamp &&
          (!message.finished_at || stamp <= Date.parse(message.finished_at)),
        )
      : undefined;
    if (reply) {
      const entries = beforeReply.get(reply.id) ?? [];
      entries.push(item);
      beforeReply.set(reply.id, entries);
    } else betweenMessages.push(item);
  }
  const items: ConversationTimelineItem[] = [];
  let cursor = 0;
  // Preserve history order while showing guidance before the reply it influenced.
  for (const message of messages) {
    if (targetReplies.has(message.id)) continue;
    while (cursor < betweenMessages.length && time(betweenMessages[cursor]!) < time(message)) {
      items.push(betweenMessages[cursor++]!);
    }
    items.push(...(beforeReply.get(message.id) ?? []));
    items.push(...(guidanceBeforeReply.get(message.id) ?? []));
    items.push({ kind: "message", id: message.id, message });
  }
  return [...items, ...betweenMessages.slice(cursor)];
}
