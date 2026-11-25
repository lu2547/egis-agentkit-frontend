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
import {
  STEERING_SOURCE,
  steeringState,
  withSteeringState,
  messageFromSteeringHint,
} from "./steering";
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
export interface ChatHistoryRewrite {
  message_id: string;
  input: Msg;
  retained_message_ids: string[];
}
export class ConversationEvents {
  plan?: { id: string; subject: string; state: string }[];
  subagentConfirmations: SubagentConfirmation[] = [];
  messages: Msg[];
  phase: ReplyPhase = "idle";
  private seen = new Set<string>();
  private active = new Set<string>();
  private receivedSteering = new Set<string>();
  private discarded = new Set<string>();
  private rewriteCandidates = new Map<string, Msg>();
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
    const known = new Set(this.messages.map((message) => message.id));
    const presentedHints = new Set(
      this.messages.flatMap((message) => {
        const delivery = message.metadata?.agentkit_delivery;
        return delivery &&
          typeof delivery === "object" &&
          !Array.isArray(delivery) &&
          typeof delivery.hint_id === "string"
          ? [delivery.hint_id]
          : [];
      }),
    );
    this.messages = this.messages.flatMap((message) => [
      message,
      ...message.content.flatMap((block) => {
        if (
          block.type !== "hint" ||
          block.source !== STEERING_SOURCE ||
          known.has(block.id) ||
          presentedHints.has(block.id)
        )
          return [];
        known.add(block.id);
        this.receivedSteering.add(block.id);
        return [messageFromSteeringHint(block)];
      }),
    ]);
  }

  replaceUserMessage(message: Msg, retainedMessageIds?: string[]) {
    const index = this.messages.findIndex((item) => item.id === message.id);
    const original = this.messages[index];
    const delivery = original?.metadata.agentkit_delivery;
    const hintId =
      delivery &&
      typeof delivery === "object" &&
      !Array.isArray(delivery) &&
      typeof delivery.hint_id === "string"
        ? delivery.hint_id
        : original?.id;
    const containing = steeringState(original || message)
      ? this.messages.findIndex(
          (item) =>
            item.role === "assistant" &&
            item.content.some(
              (block) =>
                block.type === "hint" &&
                block.source === STEERING_SOURCE &&
                block.id === hintId,
            ),
        )
      : -1;
    const boundary = containing >= 0 ? Math.min(index, containing) : index;
    const loaded = new Map([
      ...this.rewriteCandidates,
      ...this.messages.map((item) => [item.id, item] as const),
    ]);
    const prefix = retainedMessageIds
      ? retainedMessageIds.flatMap((id) =>
          loaded.has(id) ? [loaded.get(id)!] : [],
        )
      : this.messages.slice(0, Math.max(0, boundary));
    const retained = new Set(prefix.map((item) => item.id));
    const next = new ConversationEvents();
    // Do not restore hint projections from the containing reply during a rewrite.
    next.messages = [...prefix, message];
    next.phase = "streaming";
    next.seen = new Set(this.seen);
    // The canonical prefix may retain earlier injected users beyond the live boundary.
    if (!retainedMessageIds) next.rewriteCandidates = loaded;
    next.discarded = new Set([
      ...[...this.discarded].filter(
        (id) => id !== message.id && !retained.has(id),
      ),
      ...this.messages
        .filter((item) => item.id !== message.id && !retained.has(item.id))
        .map((item) => item.id),
    ]);
    return next;
  }

  syncQueuedMessages(messages: Msg[]) {
    const ids = new Set(messages.map((message) => message.id));
    this.messages = this.messages.filter((message) => {
      const delivery = message.metadata?.agentkit_delivery;
      return (
        !delivery ||
        typeof delivery !== "object" ||
        Array.isArray(delivery) ||
        !delivery.queue_item_id ||
        steeringState(message) === "received" ||
        ids.has(message.id)
      );
    });
    this.addSteeringMessages(
      messages.filter((message) => {
        const previous = this.messages.find((item) => item.id === message.id);
        return !previous || !!steeringState(previous);
      }),
    );
  }
  addSteeringMessages(messages: Msg[]) {
    const delivery = (message: Msg) => {
      const value = message.metadata?.agentkit_delivery;
      return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
    };
    const hintId = (message: Msg) => {
      const delivery = message.metadata?.agentkit_delivery;
      return delivery &&
        typeof delivery === "object" &&
        !Array.isArray(delivery)
        ? delivery.hint_id ||
            (delivery.state === "received" ? message.id : undefined)
        : undefined;
    };
    for (const message of messages) {
      if (this.discarded.has(message.id)) continue;
      const hint = hintId(message);
      const previous = this.messages.find(
        (item) => item.id === message.id || (hint && hintId(item) === hint),
      );
      if (
        previous?.id === message.id &&
        steeringState(previous) === "received" &&
        steeringState(message) !== "received"
      )
        continue;
      const received =
        this.receivedSteering.has(message.id) ||
        (typeof hint === "string" && this.receivedSteering.has(hint)) ||
        steeringState(previous || message) === "received" ||
        steeringState(message) === "received";
      const original = previous && previous.id !== hint ? previous : message;
      const incoming = withSteeringState(
        {
          ...message,
          id: original.id,
          metadata: {
            ...original.metadata,
            ...message.metadata,
            agentkit_delivery: {
              ...delivery(original),
              ...delivery(message),
            },
          },
        },
        received ? "received" : steeringState(message) || "queued",
      );
      this.messages = previous
        ? this.messages.map((item) => (item === previous ? incoming : item))
        : [...this.messages, incoming];
    }
  }
  apply(event: AgentEvent) {
    if (event.id && this.seen.has(event.id)) return false;
    if (event.id) this.seen.add(event.id);
    if ("reply_id" in event && this.discarded.has(event.reply_id)) return false;
    if (
      event.type === EventType.HINT_BLOCK &&
      event.source === STEERING_SOURCE
    ) {
      this.receivedSteering.add(event.block_id);
      const original = (event as unknown as { user_message?: Msg })
        .user_message;
      this.addSteeringMessages([
        original ||
          messageFromSteeringHint({
            id: event.block_id,
            hint: event.hint,
            created_at: event.created_at,
          }),
      ]);
    }

    if (event.type === EventType.CUSTOM) {
      if (event.name === "chat_history_rewritten") {
        const rewrite = event.value as unknown as ChatHistoryRewrite;
        if (
          rewrite.input?.role !== "user" ||
          rewrite.input.id !== rewrite.message_id ||
          !Array.isArray(rewrite.retained_message_ids) ||
          !rewrite.retained_message_ids.every((id) => typeof id === "string")
        )
          return false;
        Object.assign(
          this,
          this.replaceUserMessage(rewrite.input, rewrite.retained_message_ids),
        );
      } else if (event.name === "chat_input_started") {
        const queued = (
          event.value as unknown as { queue_item?: { input?: Msg | Msg[] } }
        ).queue_item?.input;
        if (queued) {
          const inputs = Array.isArray(queued) ? queued : [queued];
          if (inputs.every((message) => this.discarded.has(message.id)))
            return false;
          for (const message of inputs) {
            if (this.discarded.has(message.id)) continue;
            const saved = this.messages.findIndex(
              (item) => item.id === message.id,
            );
            if (saved < 0) this.messages.push(message);
            else if (
              steeringState(this.messages[saved]!) &&
              steeringState(this.messages[saved]!) !== "received"
            )
              this.messages[saved] = message;
          }
        }
        this.phase = "streaming";
      } else if (
        ["chat_input_failed", "chat_input_cancelled"].includes(event.name)
      ) {
        if (!this.active.size) this.phase = "idle";
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
