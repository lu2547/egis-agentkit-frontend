import type { PreviewReference } from "../domain/previewReferences";
import {
  createAnnotatedMessage,
  type TextAnnotation,
} from "../domain/textAnnotations";
import { ref, shallowRef, onScopeDispose, watch } from "vue";
import { type ToolCallBlock } from "@agentscope-ai/agentscope/message";
import {
  EventType,
  type AgentEvent,
  type UserConfirmResultEvent,
} from "@agentscope-ai/agentscope/event";
import {
  ConversationEvents,
  SessionScope,
  type SessionLease,
} from "../domain/agentEventReducer";
import { sessionApprovalRules } from "../domain/permissionApproval";
import { runtime } from "../api/runtime";
import { manager } from "../api/manager";
import { errorText } from "../api/http";
import { useChatStream } from "./useChatStream";
import { useIdentity } from "./useIdentity";
import type { Task, TaskSettings, ReplyFeedbackState } from "../types/api";
import { useTaskActivity } from "./useTaskActivity";
export function useConversation() {
  const activity = useTaskActivity();
  const replyFeedback = ref<Record<string, ReplyFeedbackState>>({});
  const task = shallowRef<Task | null>(null),
    state = shallowRef(new ConversationEvents()),
    loading = ref(false),
    error = ref(""),
    hasMore = ref(false),
    submitting = ref(false),
    settingsPending = ref(false);
  const scope = new SessionScope(),
    stream = useChatStream();
  const { refreshTasks, tasks } = useIdentity();
  function onRenamed(event: Event) {
    const renamed = (event as CustomEvent<Task>).detail;
    if (
      task.value &&
      renamed?.session_id === task.value.session_id &&
      typeof renamed.name === "string"
    ) {
      task.value = { ...task.value, name: renamed.name };
      ++metadataGeneration;
    }
  }
  if (typeof window !== "undefined") {
    window.addEventListener("agentkit:task-renamed", onRenamed);
    onScopeDispose(() =>
      window.removeEventListener("agentkit:task-renamed", onRenamed),
    );
  }
  let lease: SessionLease | null = null;
  let metadataGeneration = 0;
  let eventGeneration = 0;
  let pendingInputId: string | null = null;
  let statusRequest: SessionLease | null = null;
  async function refreshRunState() {
    const current = lease,
      selected = task.value;
    if (
      !current ||
      !selected ||
      submitting.value ||
      statusRequest === current ||
      !["streaming", "interrupting"].includes(state.value.phase)
    )
      return;
    const generation = eventGeneration;
    statusRequest = current;
    try {
      const history = await runtime.history(
        current.key,
        selected.agent_id,
        current.signal,
      );
      if (
        !scope.owns(current) ||
        generation !== eventGeneration ||
        history.is_running
      )
        return;
      // 请求仍在队列且尚未入库时，不能把它误判成失败。
      if (
        pendingInputId &&
        !history.messages.some((message) => message.id === pendingInputId)
      )
        return;
      if (
        !pendingInputId &&
        state.value.messages.some(
          (message) =>
            message.role === "assistant" &&
            !message.finished_at &&
            !history.messages.some((saved) => saved.id === message.id),
        )
      )
        return;
      const ids = new Set(history.messages.map((message) => message.id));
      state.value = new ConversationEvents(
        [
          ...state.value.messages.filter((message) => !ids.has(message.id)),
          ...history.messages,
        ],
        false,
      );
      pendingInputId = null;
      if (
        state.value.phase === "idle" &&
        !history.messages.some((message) => message.role === "assistant")
      )
        error.value = "本次处理已中断，请重新发送。";
      publish();
      startStream(current, selected, history.event_cursor);
    } catch (e) {
      if (scope.owns(current)) error.value = errorText(e);
    } finally {
      if (statusRequest === current) statusRequest = null;
    }
  }
  // 复用任务列表轮询；断流或重连后也核对后端，补偿丢失的结束事件。
  watch(tasks, (items) => {
    const selected = items.find((item) => item.session_id === lease?.key);
    if (selected && !selected.is_running && !selected.is_waiting)
      void refreshRunState();
  });
  watch(stream.connection, (connection, previous) => {
    if (
      connection === "failed" ||
      connection === "retrying" ||
      previous === "retrying"
    )
      void refreshRunState();
  });
  function startStream(
    current: SessionLease,
    selected: Task,
    cursor: string | null,
  ) {
    void stream.start(
      current.key,
      selected.agent_id,
      current.signal,
      cursor,
      (event: AgentEvent) => {
        if (!scope.owns(current)) return;
        ++eventGeneration;
        state.value.apply(event);
        if (event.type === EventType.REPLY_END && state.value.phase === "idle")
          pendingInputId = null;
        publish();
        if (
          event.type === EventType.CUSTOM &&
          event.name === "session_updated"
        ) {
          void refreshMetadata(current);
          void refreshTasks();
        }
      },
    );
  }
  async function refreshMetadata(current = lease) {
    if (!current || !scope.owns(current) || settingsPending.value) return;
    const request = ++metadataGeneration;
    try {
      const selected = await manager.task(current.key, current.signal);
      if (scope.owns(current) && request === metadataGeneration)
        task.value = selected;
    } catch (e) {
      if (scope.owns(current) && request === metadataGeneration)
        error.value = errorText(e);
    }
  }
  async function updateSettings(settings: TaskSettings) {
    if (
      !lease ||
      !task.value ||
      settingsPending.value ||
      submitting.value ||
      state.value.phase !== "idle"
    )
      return;
    const current = lease;
    ++metadataGeneration;
    settingsPending.value = true;
    error.value = "";
    try {
      const selected = await manager.updateTaskSettings(current.key, settings);
      if (scope.owns(current)) task.value = selected;
    } catch (e) {
      if (scope.owns(current)) error.value = errorText(e);
    } finally {
      if (scope.owns(current)) settingsPending.value = false;
    }
  }
  function publish() {
    if (task.value) activity.mark(task.value, state.value.phase);
    state.value = Object.assign(
      Object.create(Object.getPrototypeOf(state.value)),
      state.value,
    );
  }
  function clear() {
    replyFeedback.value = {};
    scope.dispose();
    stream.stop();
    task.value = null;
    state.value = new ConversationEvents();
    submitting.value = false;
    settingsPending.value = false;
    pendingInputId = null;
    ++eventGeneration;
    ++metadataGeneration;
  }
  async function open(sid: string) {
    clear();
    lease = scope.enter(sid);
    const current = lease;
    loading.value = true;
    error.value = "";
    try {
      const selected = await manager.task(sid, current.signal);
      if (!scope.owns(current)) return;
      task.value = selected;
      // 单次批量读取，不为历史中的每条回答各发一个请求；反馈状态失败不阻断聊天。
      void manager
        .listReplyFeedback(sid, current.signal)
        .then((result) => {
          if (scope.owns(current))
            replyFeedback.value = Object.fromEntries(
              result.items.map((item) => [item.reply_id, item]),
            );
        })
        .catch(() => {});
      const history = await runtime.history(
        sid,
        selected.agent_id,
        current.signal,
      );
      if (!scope.owns(current)) return;
      hasMore.value = history.has_more;
      state.value = new ConversationEvents(
        history.messages,
        history.is_running,
      );
      startStream(current, selected, history.event_cursor);
    } catch (e) {
      if (scope.owns(current)) {
        error.value = errorText(e);
        stream.connection.value = "failed";
      }
    } finally {
      if (scope.owns(current)) loading.value = false;
    }
  }
  async function send(
    text: string,
    references: PreviewReference[] = [],
    annotations: TextAnnotation[] = [],
  ) {
    if (
      !task.value ||
      !lease ||
      state.value.phase !== "idle" ||
      submitting.value ||
      settingsPending.value
    )
      return false;
    const current = lease,
      selected = task.value;
    const message = createAnnotatedMessage(text, references, annotations);
    submitting.value = true;
    error.value = "";
    try {
      await stream.waitReady();
      if (!scope.owns(current)) return false;
      if (state.value.phase !== "idle" || settingsPending.value) return false;
      if (stream.connection.value !== "connected")
        throw new Error("等待事件连接恢复后再发送");
      state.value.messages = [...state.value.messages, message];
      pendingInputId = message.id;
      state.value.phase = "streaming";
      publish();
      await runtime.trigger(
        selected.session_id,
        selected.agent_id,
        message,
        current.signal,
      );
      return true;
    } catch (e) {
      if (scope.owns(current)) {
        error.value = errorText(e);
        state.value.messages = state.value.messages.filter(
          (m) => m.id !== message.id,
        );
        if (
          !state.value.messages.some(
            (m) => m.role === "assistant" && !m.finished_at,
          )
        )
          state.value.phase = "idle";
        publish();
      }
      return false;
    } finally {
      if (scope.owns(current)) submitting.value = false;
    }
  }
  async function confirm(
    replyId: string,
    tool: ToolCallBlock,
    confirmed: boolean,
    rememberForSession = false,
  ) {
    if (!task.value || !lease) return;
    const current = lease,
      selected = task.value;
    error.value = "";
    const rules =
      confirmed && rememberForSession ? sessionApprovalRules(tool) : [];
    const event: UserConfirmResultEvent = {
      type: EventType.USER_CONFIRM_RESULT,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      reply_id: replyId,
      confirm_results: [
        { confirmed, tool_call: tool, rules: rules.length ? rules : null },
      ],
    };
    try {
      state.value.phase = "streaming";
      publish();
      await runtime.trigger(
        selected.session_id,
        selected.agent_id,
        event,
        current.signal,
      );
    } catch (e) {
      if (scope.owns(current)) {
        error.value = errorText(e);
        state.value.phase = "waiting";
        publish();
      }
      throw e;
    }
  }
  async function stop() {
    if (!task.value || !lease) return;
    const current = lease;
    state.value.phase = "interrupting";
    publish();
    try {
      await runtime.stop(task.value.session_id, task.value.agent_id);
    } catch (e) {
      if (scope.owns(current)) {
        error.value = errorText(e);
        state.value.phase = "streaming";
        publish();
      }
    }
  }
  async function older() {
    if (!task.value || !lease || !hasMore.value || loading.value) return;
    const current = lease;
    loading.value = true;
    try {
      const history = await runtime.history(
        task.value.session_id,
        task.value.agent_id,
        current.signal,
        state.value.messages[0]?.id,
      );
      if (scope.owns(current)) {
        const ids = new Set(state.value.messages.map((m) => m.id));
        state.value.messages = [
          ...history.messages.filter((m) => !ids.has(m.id)),
          ...state.value.messages,
        ];
        hasMore.value = history.has_more;
        publish();
      }
    } catch (e) {
      if (scope.owns(current)) error.value = errorText(e);
    } finally {
      if (scope.owns(current)) loading.value = false;
    }
  }
  onScopeDispose(clear);
  return {
    replyFeedback,
    task,
    state,
    loading,
    error,
    connection: stream.connection,
    streamError: stream.error,
    hasMore,
    submitting,
    settingsPending,
    updateSettings,
    open,
    send,
    stop,
    confirm,
    older,
    clear,
    retry: stream.retry,
    refreshMetadata,
    refreshRunState,
  };
}
