/** 按会话管理待发引导；失败保留原消息 ID，接受后才移除草稿。 */
import { computed, reactive, type Ref } from "vue";
import type { Msg } from "@agentscope-ai/agentscope/message";
import {
  createAnnotatedMessage,
  type TextAnnotation,
} from "../domain/textAnnotations";
import type { PreviewReference } from "../domain/previewReferences";

export interface SteeringDraft {
  message: Msg;
  text: string;
  references: PreviewReference[];
  annotations: TextAnnotation[];
  status: "draft" | "sending" | "failed";
}
const drafts = reactive(new Map<string, SteeringDraft[]>());
const deliveries = new Map<string, Promise<void>>();
export function clearSteeringQueues() {
  drafts.clear();
}

export function useSteeringQueue(
  sessionId: Ref<string>,
  limit: Ref<number>,
  dispatch: (messages: Msg[], sessionId: string) => Promise<boolean>,
) {
  const items = computed(() => drafts.get(sessionId.value) || []);
  const sending = computed(() =>
    items.value.some((item) => item.status === "sending"),
  );
  function add(
    text: string,
    references: PreviewReference[] = [],
    annotations: TextAnnotation[] = [],
  ) {
    if (!text.trim() && !references.length && !annotations.length) return false;
    if (!limit.value || items.value.length >= limit.value)
      throw new Error(`待发引导最多 ${limit.value} 条，请先发送或删除已有引导`);
    drafts.set(sessionId.value, [
      ...items.value,
      {
        text,
        references: [...references],
        annotations: [...annotations],
        message: createAnnotatedMessage(text, references, annotations),
        status: "draft",
      },
    ]);
    return true;
  }
  function edit(id: string, text: string) {
    const item = items.value.find((item) => item.message.id === id);
    if (
      !item ||
      item.status !== "draft" ||
      (!text.trim() && !item.references.length && !item.annotations.length)
    )
      return;
    item.text = text;
    item.message = {
      ...createAnnotatedMessage(text, item.references, item.annotations),
      id,
    };
  }
  function remove(id: string) {
    if (sending.value) return;
    drafts.set(
      sessionId.value,
      items.value.filter((item) => item.message.id !== id),
    );
  }
  function move(id: string, index: number) {
    if (sending.value || index < 0 || index >= items.value.length) return;
    const next = [...items.value],
      previous = next.findIndex((item) => item.message.id === id);
    if (previous < 0) return;
    next.splice(index, 0, next.splice(previous, 1)[0]!);
    drafts.set(sessionId.value, next);
  }
  async function send(ids: string[]) {
    const sid = sessionId.value,
      selected = items.value.filter(
        (item) => ids.includes(item.message.id) && item.status !== "sending",
      );
    if (!selected.length) return false;
    selected.forEach((item) => {
      item.status = "sending";
    });
    const previous = deliveries.get(sid);
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    deliveries.set(sid, current);
    if (previous) await previous;
    let accepted = false;
    try {
      accepted = await dispatch(
        selected.map((item) => item.message),
        sid,
      );
    } catch {
      /* 草稿保留，调用方负责展示具体请求错误。 */
    }
    if (accepted) {
      const remaining = (drafts.get(sid) || []).filter(
        (item) => !selected.some((sent) => sent.message.id === item.message.id),
      );
      if (remaining.length) drafts.set(sid, remaining);
      else drafts.delete(sid);
    } else
      selected.forEach((item) => {
        item.status = "failed";
      });
    release();
    if (deliveries.get(sid) === current) deliveries.delete(sid);
    return accepted;
  }
  return { items, sending, add, edit, remove, move, send };
}
