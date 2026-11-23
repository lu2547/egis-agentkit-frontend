/** 服务端保存待发消息，只有原生注入确认才将引导移出队列。 */
import { computed, reactive, watch, onScopeDispose, type Ref } from "vue";
import type { Msg } from "@agentscope-ai/agentscope/message";
import type { AgentEvent } from "@agentscope-ai/agentscope/event";
import { runtime, type ChatQueueItem, type ChatQueue } from "../api/runtime";
import { errorText } from "../api/http";
import {
  createAnnotatedMessage,
  getTextAnnotations,
  type TextAnnotation,
} from "../domain/textAnnotations";
import {
  getMessageReferences,
  getMessageProjectFiles,
  type ChatReference,
} from "../domain/previewReferences";

export interface SteeringDraft {
  id: string;
  message: Msg;
  text: string;
  references: ChatReference[];
  annotations: TextAnnotation[];
  status: "draft" | "sending" | "failed";
  error?: string;
  notice?: string;
}
const queues = reactive(new Map<string, ChatQueueItem[]>());
const errors = reactive(new Map<string, string>());
const pending = reactive(new Set<string>());
const notices = reactive(new Map<string, string>());
const revisions = new Map<string, number>();
let identityGeneration = 0;
export function clearSteeringQueues() {
  ++identityGeneration;
  queues.clear();
  errors.clear();
  pending.clear();
  notices.clear();
  revisions.clear();
}
function snapshot(sid: string, items: ChatQueueItem[]) {
  const previous = queues.get(sid) || [];
  for (const item of items) {
    if (
      item.state === "queued" &&
      previous.some((old) => old.id === item.id && old.state === "steering")
    )
      notices.set(item.id, "本轮未消费，已退回队列");
    else if (item.state !== "queued") notices.delete(item.id);
  }
  revisions.set(sid, (revisions.get(sid) || 0) + 1);
  queues.set(sid, items);
}
export function observeChatQueue(sid: string, event: AgentEvent) {
  if (event.type === "CUSTOM" && event.name === "chat_queue_changed") {
    const items = (event.value as unknown as ChatQueue).items;
    if (Array.isArray(items)) snapshot(sid, items);
  }
}
function messages(item: ChatQueueItem) {
  return Array.isArray(item.input) ? item.input : [item.input];
}
function draft(item: ChatQueueItem): SteeringDraft {
  const inputs = messages(item),
    message = inputs[0]!;
  const prompt =
    message.metadata?.annotation_prompt ?? message.metadata?.preview_prompt;
  return {
    id: item.id,
    message,
    text:
      typeof prompt === "string"
        ? prompt
        : message.content
            .flatMap((block) => (block.type === "text" ? [block.text] : []))
            .join("\n"),
    references: [
      ...getMessageReferences(message),
      ...getMessageProjectFiles(message),
    ],
    annotations: getTextAnnotations(message),
    status:
      pending.has(item.id) || item.state === "steering"
        ? "sending"
        : item.state === "failed"
          ? "failed"
          : "draft",
    error: errors.get(item.id) || item.error || undefined,
    notice: notices.get(item.id),
  };
}

export function useSteeringQueue(
  sessionId: Ref<string>,
  limit: Ref<number>,
  agentId: Ref<string>,
  replyId: Ref<string>,
  onError: (message: string) => void,
  presentedMessageIds?: Ref<ReadonlySet<string>>,
) {
  const presented = (item: ChatQueueItem) =>
    messages(item).every((message) =>
      presentedMessageIds?.value.has(message.id),
    );
  const waitingForExecution = computed(() =>
    (queues.get(sessionId.value) || []).some(
      (item) => item.state === "queued" && presented(item),
    ),
  );
  const items = computed(() =>
    (queues.get(sessionId.value) || [])
      .filter((item) => item.state !== "queued" || !presented(item))
      .map(draft),
  );
  const sending = computed(() =>
    items.value.some((item) => pending.has(item.id)),
  );
  const controller = new AbortController();
  const loads = new Map<string, number>();
  async function refresh(sid = sessionId.value, aid = agentId.value) {
    if (!sid || !aid || controller.signal.aborted) return;
    const generation = identityGeneration,
      revision = revisions.get(sid) || 0;
    const request = (loads.get(sid) || 0) + 1;
    loads.set(sid, request);
    try {
      const result = await runtime.queue(sid, aid, controller.signal);
      if (
        generation === identityGeneration &&
        !controller.signal.aborted &&
        loads.get(sid) === request &&
        revision === (revisions.get(sid) || 0)
      )
        snapshot(sid, result.items);
    } catch (error) {
      if (
        !controller.signal.aborted &&
        generation === identityGeneration &&
        sessionId.value === sid &&
        agentId.value === aid &&
        loads.get(sid) === request
      )
        onError(errorText(error));
    }
  }
  async function mutate(
    id: string,
    action: (sid: string, aid: string) => Promise<ChatQueue>,
  ) {
    const sid = sessionId.value,
      aid = agentId.value,
      generation = identityGeneration;
    if (!sid || !aid || pending.has(id)) return false;
    const revision = revisions.get(sid) || 0;
    pending.add(id);
    errors.delete(id);
    notices.delete(id);
    try {
      const result = await action(sid, aid);
      if (
        !controller.signal.aborted &&
        generation === identityGeneration &&
        revision === (revisions.get(sid) || 0)
      )
        snapshot(sid, result.items);
      return true;
    } catch (error) {
      if (!controller.signal.aborted && generation === identityGeneration) {
        errors.set(id, errorText(error));
        if (sessionId.value === sid) onError(errorText(error));
      }
      return false;
    } finally {
      pending.delete(id);
      if (generation === identityGeneration) await refresh(sid, aid);
    }
  }
  async function add(
    text: string,
    references: ChatReference[] = [],
    annotations: TextAnnotation[] = [],
  ) {
    if (!text.trim() && !references.length && !annotations.length) return false;
    if (
      !limit.value ||
      (queues.get(sessionId.value)?.length || 0) >= limit.value
    )
      throw new Error(`待发引导最多 ${limit.value} 条，请先发送或删除已有引导`);
    const sid = sessionId.value,
      aid = agentId.value,
      generation = identityGeneration;
    if (!sid || !aid) return false;
    const result = await runtime.trigger(
      sid,
      aid,
      createAnnotatedMessage(text, references, annotations),
      controller.signal,
    );
    if (generation !== identityGeneration || controller.signal.aborted)
      return false;
    await refresh(sid, aid);
    return result.queue_item_id || false;
  }
  async function edit(id: string, text: string) {
    const item = items.value.find((item) => item.id === id);
    const raw = queues.get(sessionId.value)?.find((item) => item.id === id);
    if (
      !item ||
      !raw ||
      item.status === "sending" ||
      (!text.trim() && !item.references.length && !item.annotations.length)
    )
      return false;
    // 只替换第一条消息的用户正文；引用摘录、附件、批注和批量尾部原样保留。
    const next = JSON.parse(JSON.stringify(item.message)) as Msg;
    const block = next.content.find((block) => block.type === "text");
    const oldPrompt =
      next.metadata?.annotation_prompt ?? next.metadata?.preview_prompt;
    if (block?.type === "text") {
      block.text =
        typeof oldPrompt === "string" && block.text.startsWith(oldPrompt)
          ? text + block.text.slice(oldPrompt.length)
          : text;
    } else
      next.content.unshift(createAnnotatedMessage(text, [], []).content[0]!);
    for (const key of ["preview_prompt", "annotation_prompt"]) {
      if (typeof next.metadata?.[key] === "string") next.metadata[key] = text;
    }
    const input = [next, ...messages(raw).slice(1)];
    return mutate(id, (sid, aid) =>
      runtime.updateQueued(sid, aid, id, input, controller.signal),
    );
  }
  async function remove(id: string) {
    return mutate(id, (sid, aid) =>
      runtime.removeQueued(sid, aid, id, controller.signal),
    );
  }
  async function move(id: string, index: number) {
    const ids = items.value.map((item) => item.id),
      previous = ids.indexOf(id);
    if (previous < 0 || index < 0 || index >= ids.length || sending.value)
      return false;
    ids.splice(index, 0, ids.splice(previous, 1)[0]!);
    // 已显示在消息区的普通请求仍留在原生 FIFO 中，只调整可见引导的位置。
    const visible = new Set(ids);
    let position = 0;
    const order = (queues.get(sessionId.value) || []).map((item) =>
      visible.has(item.id) ? ids[position++]! : item.id,
    );
    return mutate(id, (sid, aid) =>
      runtime.reorderQueued(sid, aid, order, controller.signal),
    );
  }
  async function send(ids: string[]) {
    const sid = sessionId.value,
      aid = agentId.value,
      reply = replyId.value;
    if (!reply) {
      onError("当前回复已结束，队列消息将在下一轮执行");
      return false;
    }
    let accepted = true;
    for (const id of ids) {
      if (sessionId.value !== sid || agentId.value !== aid) break;
      const item = items.value.find((item) => item.id === id);
      if (!item || item.status === "sending") continue;
      accepted =
        (await mutate(id, () =>
          runtime.steerQueued(sid, aid, id, reply, controller.signal),
        )) && accepted;
    }
    return accepted;
  }
  watch(
    [sessionId, agentId],
    () => {
      void refresh();
    },
    { immediate: true },
  );
  const timer = setInterval(() => {
    if (typeof document === "undefined" || !document.hidden) void refresh();
  }, 5000);
  onScopeDispose(() => {
    controller.abort();
    clearInterval(timer);
  });
  return {
    items,
    waitingForExecution,
    sending,
    add,
    edit,
    remove,
    move,
    send,
    refresh,
  };
}
