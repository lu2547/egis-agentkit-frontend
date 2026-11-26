import type { Msg } from "@agentscope-ai/agentscope/message";
import { ReplyFinishedReason } from "@agentscope-ai/agentscope/event";
import type { CollaboratorProgress } from "../types/api";
import { STEERING_SOURCE, steeringState } from "./steering";
import { presentTurn } from "./turnPresentation";

export type ConversationTimelineItem =
  | { kind: "message"; id: string; created_at?: string; message: Msg; final?: boolean }
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
  const replyGuidance = new Map<string, Msg[]>();
  for (const message of messages) {
    const target = targetReplies.get(message.id);
    if (!target) continue;
    const entries = replyGuidance.get(target) || [];
    entries.push(message);
    replyGuidance.set(target, entries);
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
  // Keep native history intact; split only its display at actual context injection.
  for (const message of messages) {
    if (targetReplies.has(message.id)) continue;
    while (cursor < betweenMessages.length && time(betweenMessages[cursor]!) < time(message)) {
      items.push(betweenMessages[cursor++]!);
    }
    items.push(...(beforeReply.get(message.id) ?? []));
    items.push(...replySegments(message, replyGuidance.get(message.id) || [], steeringByHint));
  }
  return [...items, ...betweenMessages.slice(cursor)];
}

function replySegments(message: Msg, guidance: Msg[], byHint: Map<string, Msg>): ConversationTimelineItem[] {
  if (!guidance.length || message.role !== "assistant")
    return [{ kind: "message", id: message.id, message }];
  const items: ConversationTimelineItem[] = [];
  const placed = new Set<string>();
  let blocks: Msg["content"] = [], key = message.id, started = message.created_at;
  const results = message.content.filter(block => block.type === "tool_result");
  function append(final: boolean, end?: string) {
    const presentation = presentTurn({ ...message, content: blocks });
    const visible = presentation.entries.length > 0 || !!presentation.answer;
    if (!visible && !final) return;
    const calls = new Set(blocks.filter(block => block.type === "tool_call").map(block => block.id));
    // Tool results can arrive after the injection marker; keep them with their calls.
    const content = [
      ...blocks,
      ...results.filter(block => calls.has(block.id) && !blocks.includes(block)),
    ];
    const id = items.some(item => item.kind === "message" && item.message.role === "assistant") ? key : message.id;
    items.push({ kind: "message", id, final, message: {
      ...message, content, created_at: started,
      ...(final ? {} : { finished_at: end || message.created_at, finished_reason: ReplyFinishedReason.COMPLETED, error: null }),
    } });
  }
  for (const block of message.content) {
    const instruction = block.type === "hint" && block.source === STEERING_SOURCE
      ? byHint.get(block.id) : undefined;
    if (!instruction) { blocks.push(block); continue; }
    append(false, block.created_at);
    items.push({ kind: "message", id: instruction.id, message: instruction });
    placed.add(instruction.id);
    blocks = [];
    key = `${message.id}:after:${block.id}`;
    started = block.created_at || message.created_at;
  }
  const unplaced = guidance.filter(instruction => !placed.has(instruction.id));
  // Old metadata may identify a reply without retaining its injection marker.
  // Pending inputs stay after existing work until receipt establishes a boundary.
  items.unshift(...unplaced.filter(instruction => steeringState(instruction) === "received")
    .map(instruction => ({ kind: "message" as const, id: instruction.id, message: instruction })));
  append(true);
  items.push(...unplaced.filter(instruction => steeringState(instruction) !== "received")
    .map(instruction => ({ kind: "message" as const, id: instruction.id, message: instruction })));
  return items;
}
