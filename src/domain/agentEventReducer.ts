import {
  appendEvent,
  AssistantMsg,
  UserMsg,
  SystemMsg,
  type Msg,
  type ToolCallBlock,
} from "@agentscope-ai/agentscope/message";
import { EventType, type AgentEvent } from "@agentscope-ai/agentscope/event";
export type ReplyPhase = "idle" | "streaming" | "waiting" | "interrupting";
export interface SubagentConfirmation {
  worker_session_id: string;
  worker_agent_id: string;
  worker_agent_name: string;
  reply_id: string;
  event_type: string;
  event: { tool_calls?: ToolCallBlock[] };
  created_at: string;
}
export class ConversationEvents {
  plan?: { id: string; subject: string; state: string }[];
  subagentConfirmations: SubagentConfirmation[] = [];
  messages: Msg[];
  phase: ReplyPhase = "idle";
  private seen = new Set<string>();
  private active = new Set<string>();
  constructor(history: Msg[] = [], isRunning = false) {
    this.messages = history;
    const pending = history.filter(
      (m) => !m.finished_at && m.role === "assistant",
    );
    for (const message of pending) this.active.add(message.id);
    this.phase = pending.some((m) =>
      m.content.some(
        (b) =>
          b.type === "tool_call" &&
          (b.state === "asking" || b.state === "submitted"),
      ),
    )
      ? "waiting"
      : isRunning
        ? "streaming"
        : "idle";
  }
  apply(event: AgentEvent) {
    if (event.id && this.seen.has(event.id)) return false;
    if (event.id) this.seen.add(event.id);
    if (event.type === EventType.CUSTOM) {
      if (event.name === "state_updated") {
        const context = (event.value as { tasks_context?: { tasks?: unknown } }).tasks_context;
        if (Array.isArray(context?.tasks)) this.plan = context.tasks
          .filter((item): item is { id: string; subject: string; state: string } =>
            !!item && typeof item.id === "string" && typeof item.subject === "string" &&
            ["pending", "in_progress", "completed"].includes(item.state))
          .map(({ id, subject, state }) => ({ id, subject, state }));
      } else if (event.name === "subagent_require_user_confirm") {
        const entry = event.value as unknown as SubagentConfirmation;
        this.subagentConfirmations = [
          ...this.subagentConfirmations.filter(
            (e) =>
              e.worker_session_id !== entry.worker_session_id ||
              e.reply_id !== entry.reply_id,
          ),
          entry,
        ];
        this.phase = "waiting";
      } else if (event.name === "subagent_user_confirm_result") {
        this.subagentConfirmations = this.subagentConfirmations.filter(
          (e) =>
            e.worker_session_id !== event.value.worker_session_id ||
            e.reply_id !== event.value.reply_id,
        );
        this.phase = this.subagentConfirmations.length
          ? "waiting"
          : this.active.size
            ? "streaming"
            : "idle";
      }
      return true;
    }
    if (event.type === EventType.REPLY_START) {
      if (!this.messages.some((m) => m.id === event.reply_id)) {
        const create =
          event.role === "user"
            ? UserMsg
            : event.role === "system"
              ? SystemMsg
              : AssistantMsg;
        this.messages.push(
          create({
            id: event.reply_id,
            name: event.name,
            content: [],
            created_at: event.created_at,
          }),
        );
      }
      if (event.role !== "user") {
        this.active.add(event.reply_id);
        this.phase = "streaming";
      }
    } else {
      const message = this.messages.find((m) => m.id === event.reply_id);
      if (message) {
        appendEvent(message, event);
        const updated = { ...message, content: [...message.content] };
        this.messages = this.messages.map((m) =>
          m.id === message.id ? updated : m,
        );
      }
      if (
        event.type === EventType.REQUIRE_USER_CONFIRM ||
        event.type === EventType.REQUIRE_EXTERNAL_EXECUTION
      )
        this.phase = "waiting";
      if (event.type === EventType.REPLY_END) {
        this.active.delete(event.reply_id);
        this.phase = this.subagentConfirmations.length
          ? "waiting"
          : this.active.size
            ? "streaming"
            : "idle";
      }
    }
    this.messages = [...this.messages];
    return true;
  }
}
export interface SessionLease {
  key: string;
  signal: AbortSignal;
  generation: number;
}
/** Owns both history and stream requests so an old session can never publish into a new one. */
export class SessionScope {
  private controller: AbortController | null = null;
  private generation = 0;
  enter(key: string): SessionLease {
    this.dispose();
    this.controller = new AbortController();
    return { key, signal: this.controller.signal, generation: this.generation };
  }
  owns(lease: SessionLease) {
    return lease.generation === this.generation && !lease.signal.aborted;
  }
  dispose() {
    this.controller?.abort();
    this.controller = null;
    this.generation++;
  }
}
