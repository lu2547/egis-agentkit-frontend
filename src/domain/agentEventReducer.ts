import {
  appendEvent,
  AssistantMsg,
  UserMsg,
  SystemMsg,
  type Msg,
  type ToolCallBlock,
} from "@agentscope-ai/agentscope/message";
import {
  ErrorType,
  EventType,
  ReplyFinishedReason,
  type AgentEvent,
} from "@agentscope-ai/agentscope/event";
import { STEERING_SOURCE, steeringState, withSteeringState } from "./steering";
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
  private receivedSteering = new Set<string>();
  /** 请求已进入处理，但尚未收到原生回复开始事件；只用于页面占位。 */
  get isPreparing() {
    return this.phase === "streaming" && this.active.size === 0;
  }
  constructor(history: Msg[] = [], isRunning = false) {
    // 后端确认已停止时，历史中的未收尾回复不能继续占用当前运行状态。
    // 等待审批的工具调用属于暂停，保留其可继续执行的状态。
    this.messages = history.map((message) => {
      const waiting = message.content.some(
        (block) =>
          block.type === "tool_call" &&
          ["asking", "submitted"].includes(block.state),
      );
      if (
        isRunning ||
        message.role !== "assistant" ||
        message.finished_at ||
        waiting
      )
        return message;
      return {
        ...message,
        finished_at: new Date().toISOString(),
        finished_reason: message.finished_reason || ReplyFinishedReason.ERROR,
        error:
          message.error ||
          (message.finished_reason
            ? null
            : {
                type: ErrorType.CONNECTION,
                message: "本次处理已中断，请重新发送。",
              }),
      };
    });
    const pending = this.messages.filter(
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
    for (const message of this.messages)
      for (const block of message.content)
        if (block.type === "hint" && block.source === STEERING_SOURCE)
          this.receivedSteering.add(block.id);
    this.messages = this.messages.map((message) =>
      this.receivedSteering.has(message.id) && steeringState(message)
        ? withSteeringState(message, "received")
        : message,
    );
  }
  addSteeringMessages(messages: Msg[]) {
    for (const message of messages) {
      const previous = this.messages.find((item) => item.id === message.id);
      const received =
        this.receivedSteering.has(message.id) ||
        (previous && steeringState(previous) === "received") ||
        steeringState(message) === "received";
      const incoming = withSteeringState(
        message,
        received ? "received" : "queued",
      );
      this.messages = previous
        ? this.messages.map((item) =>
            item.id === message.id ? incoming : item,
          )
        : [...this.messages, incoming];
    }
  }
  apply(event: AgentEvent) {
    if (event.id && this.seen.has(event.id)) return false;
    if (event.id) this.seen.add(event.id);
    if (
      event.type === EventType.HINT_BLOCK &&
      event.source === STEERING_SOURCE
    ) {
      this.receivedSteering.add(event.block_id);
      this.messages = this.messages.map((message) =>
        message.id === event.block_id && steeringState(message)
          ? withSteeringState(message, "received")
          : message,
      );
    }
    if (event.type === EventType.CUSTOM) {
      if (event.name === STEERING_SOURCE) {
        const inputs = (event.value as unknown as { messages?: Msg[] })
          .messages;
        if (Array.isArray(inputs))
          this.addSteeringMessages(
            inputs.filter(
              (message) => message.role === "user" && !!steeringState(message),
            ),
          );
      } else if (event.name === "state_updated") {
        const context = (event.value as { tasks_context?: { tasks?: unknown } })
          .tasks_context;
        if (Array.isArray(context?.tasks))
          this.plan = context.tasks
            .filter(
              (item): item is { id: string; subject: string; state: string } =>
                !!item &&
                typeof item.id === "string" &&
                typeof item.subject === "string" &&
                ["pending", "in_progress", "completed"].includes(item.state),
            )
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
