import type { ChatReference } from "../domain/previewReferences";
import {
  createAnnotatedMessage,
  type TextAnnotation,
} from "../domain/textAnnotations";
import { ref, shallowRef, onScopeDispose, watch } from "vue";
import { type Msg, type ToolCallBlock } from "@agentscope-ai/agentscope/message";
import {
  EventType,
  type AgentEvent,
  type UserConfirmResultEvent,
} from "@agentscope-ai/agentscope/event";
import {
  ConversationEvents,
  SessionScope,
  type SessionLease,
  type ChatHistoryRewrite,
} from "../domain/agentEventReducer";
import { sessionApprovalRules } from "../domain/permissionApproval";
import {
  canSendUserMessage,
  editedUserMessage,
  userMessageText,
} from "../domain/userMessageEditing";
import { runtime } from "../api/runtime";
import { manager } from "../api/manager";
import { errorText } from "../api/http";
import { useChatStream } from "./useChatStream";
import { useIdentity } from "./useIdentity";
import type {
  CollaboratorProgress,
  Task,
  TaskSettings,
  ReplyFeedbackState,
} from "../types/api";
import { observeChatQueue } from "./useSteeringQueue";
import { useTaskActivity } from "./useTaskActivity";
export function useConversation() {
  const activity = useTaskActivity();
  const collaboratorProgress = shallowRef(new Map<string, CollaboratorProgress>());
  const removedCollaborators = new Set<string>();
  function mergeCollaboratorProgress(entries: CollaboratorProgress[]) {
    const progress = new Map(collaboratorProgress.value);
    for (const entry of entries) {
      const id = entry.worker_session_id;
      const previous = progress.get(id);
      const terminal =
        previous &&
        ["completed", "failed", "interrupted"].includes(previous.status);
      const reopensFinishedReply =
        terminal &&
        previous.reply_id === entry.reply_id &&
        !["completed", "failed", "interrupted"].includes(entry.status);
      if (
        !removedCollaborators.has(id) &&
        !reopensFinishedReply &&
        (previous?.revision ?? 0) < entry.revision
      ) {
        progress.set(id, entry);
      }
    }
    collaboratorProgress.value = progress;
  }
  const replyFeedback = ref<Record<string, ReplyFeedbackState>>({});
  const task = shallowRef<Task | null>(null),
    state = shallowRef(new ConversationEvents()),
    loading = ref(false),
    error = ref(""),
    hasMore = ref(false),
    submitting = ref(false),
    settingsPending = ref(false);
  function forgetCollaborator(workerId: string) {
    removedCollaborators.add(workerId);
    const progress = new Map(collaboratorProgress.value);
    progress.delete(workerId);
    collaboratorProgress.value = progress;
    if (task.value) {
      ++metadataGeneration;
      task.value = {
        ...task.value,
        collaborators: task.value.collaborators?.filter(
          (member) =>
            !member.worker_session_id ||
            !removedCollaborators.has(member.worker_session_id),
        ),
      };
    }
  }
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
  let rewriteGeneration = 0;
  let rewrittenInput: Msg | null = null;
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
    if (lease && connection === "connected") void refreshMetadata(lease);
    if (lease && (connection === "failed" || connection === "retrying"))
      activity.clearReplyEnd(lease.key);
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
        if (!state.value.apply(event)) return;
        observeChatQueue(current.key, event);
        if (event.type === EventType.CUSTOM) {
          if (event.name === "chat_history_rewritten") {
            const rewrite = event.value as unknown as ChatHistoryRewrite;
            ++rewriteGeneration;
            rewrittenInput = rewrite.input;
            const loaded = new Set(
              state.value.messages.map((message) => message.id),
            );
            hasMore.value = rewrite.retained_message_ids.some(
              (id) => !loaded.has(id),
            );
            pendingInputId = rewrite.input.id;
            collaboratorProgress.value = new Map();
            error.value = "";
          } else if (["chat_input_failed", "chat_input_steer_failed"].includes(event.name)) {
            error.value = typeof event.value.message === "string" ? event.value.message : "队列消息处理失败，请重试";
          } else if (event.name === "collaborator_progress") {
            mergeCollaboratorProgress([event.value as unknown as CollaboratorProgress]);
          } else if (event.name === "collaborator_progress_removed") {
            const id = event.value.worker_session_id;
            if (typeof id === "string") {
              forgetCollaborator(id);
            }
          }
        }
        const replyEnded =
          event.type === EventType.REPLY_END && state.value.phase === "idle";
        if (replyEnded)
          pendingInputId = null;
        publish(replyEnded);
        if (
          event.type === EventType.CUSTOM &&
          ["session_updated", "state_updated", "chat_history_rewritten"].includes(event.name)
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
    const observedRunId = activity.activity.value[current.key]?.latestScheduleRunId;
    try {
      const selected = await manager.task(current.key, current.signal);
      if (scope.owns(current) && request === metadataGeneration) {
        task.value = selected;
        activity.acknowledge(selected, observedRunId);
        mergeCollaboratorProgress(selected.collaborator_progress ?? []);
      }
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
      !["idle", "waiting"].includes(state.value.phase) ||
      (state.value.phase === "waiting" && settings.model_key !== undefined)
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
  function publish(replyEnded = false) {
    if (task.value) activity.mark(task.value, state.value.phase, replyEnded);
    state.value = Object.assign(
      Object.create(Object.getPrototypeOf(state.value)),
      state.value,
    );
  }
  function syncQueuedMessages(sid: string, messages: Msg[]) {
    if (task.value?.session_id !== sid || loading.value) return;
    state.value.syncQueuedMessages(messages);
    publish();
  }
  function clear() {
    replyFeedback.value = {};
    collaboratorProgress.value = new Map();
    removedCollaborators.clear();
    scope.dispose();
    stream.stop();
    task.value = null;
    state.value = new ConversationEvents();
    submitting.value = false;
    settingsPending.value = false;
    pendingInputId = null;
    rewrittenInput = null;
    ++eventGeneration;
    ++metadataGeneration;
  }
  async function open(sid: string, initialTask?: Task) {
    clear();
    if (initialTask?.session_id === sid) task.value = initialTask;
    lease = scope.enter(sid);
    const current = lease;
    loading.value = true;
    error.value = "";
    const observedRunId = activity.activity.value[sid]?.latestScheduleRunId;
    try {
      const selected = await manager.task(sid, current.signal);
      if (!scope.owns(current)) return;
      task.value = selected;
      mergeCollaboratorProgress(selected.collaborator_progress ?? []);
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
      activity.acknowledge(selected, observedRunId);
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
    references: ChatReference[] = [],
    annotations: TextAnnotation[] = [],
  ) {
    return sendMessage(createAnnotatedMessage(text, references, annotations));
  }
  async function sendMessage(message: Msg) {
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
  async function resend(message: Msg, text: string): Promise<boolean> {
    const current = lease,
      selected = task.value;
    const original = state.value.messages.find((item) => item.id === message.id);
    if (
      !current ||
      !selected ||
      !original ||
      original.role !== "user" ||
      loading.value ||
      submitting.value ||
      settingsPending.value ||
      state.value.phase !== "idle" ||
      stream.connection.value !== "connected" ||
      [...collaboratorProgress.value.values()].some((entry) =>
        ["running", "waiting"].includes(entry.status),
      ) ||
      !canSendUserMessage(original, text)
    )
      return false;
    const previous = state.value;
    const previousInputId = pendingInputId;
    const previousProgress = collaboratorProgress.value;
    const previousRewrite = rewriteGeneration;
    submitting.value = true;
    error.value = "";
    ++eventGeneration;
    ++metadataGeneration;
    collaboratorProgress.value = new Map();
    state.value = previous.replaceUserMessage(editedUserMessage(original, text));
    pendingInputId = original.id;
    publish();
    try {
      await runtime.trigger(
        selected.session_id,
        selected.agent_id,
        state.value.messages.at(-1)!,
        current.signal,
        original.id,
      );
      return scope.owns(current);
    } catch (e) {
      if (scope.owns(current)) {
        if (rewriteGeneration !== previousRewrite) {
          if (
            rewrittenInput?.id === original.id &&
            userMessageText(rewrittenInput) === text
          )
            return true;
          error.value = errorText(e);
          return false;
        }
        error.value = errorText(e);
        state.value = previous;
        collaboratorProgress.value = previousProgress;
        pendingInputId = previousInputId;
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
    collaboratorProgress,
    syncQueuedMessages,
    forgetCollaborator,
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
    sendMessage,
    resend,
    stop,
    confirm,
    older,
    clear,
    retry: stream.retry,
    refreshMetadata,
    refreshRunState,
  };
}
