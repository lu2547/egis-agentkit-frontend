<script setup lang="ts">
/** 文字注释交互层：选择原文、草稿编号、回答后的精确定位与只读详情。 */
import {
  computed,
  nextTick,
  onMounted,
  onBeforeUnmount,
  ref,
  watch,
} from "vue";
import type { Msg } from "@agentscope-ai/agentscope/message";
import {
  annotationThreads,
  type TextAnnotation,
} from "../../domain/textAnnotations";
const props = defineProps<{
  messages: Msg[];
  drafts: TextAnnotation[];
  hasMore: boolean;
  loadOlder: () => Promise<void>;
}>();
const emit = defineEmits<{
  add: [annotation: TextAnnotation];
  focusDraft: [id: string];
}>();
const root = ref<HTMLElement>();
const candidate = ref<{ annotation: TextAnnotation; x: number; y: number }>();
const focused = ref<{
  annotation: TextAnnotation;
  index: number;
  answered: boolean;
}>();
const error = ref("");
const rectangles = ref<
  { x: number; y: number; width: number; height: number; focused: boolean }[]
>([]);
// 同一个路径只填色一次，即使多个文字框或注释相交，也不会叠加透明度。
const highlightPath = computed(() =>
  rectangles.value
    .map(
      (rect) =>
        `M${rect.x},${rect.y}h${rect.width}v${rect.height}h${-rect.width}Z`,
    )
    .join(" "),
);
const badges = ref<
  { annotation: TextAnnotation; index: number; x: number; y: number }[]
>([]);
const threads = computed(() => annotationThreads(props.messages));
const pending = computed(() => {
  const values = new Map<
    string,
    { annotation: TextAnnotation; index: number }
  >();
  for (const item of threads.value)
    if (!item.answered) values.set(item.annotation.id, item);
  props.drafts.forEach((annotation, index) =>
    values.set(annotation.id, { annotation, index: index + 1 }),
  );
  return [...values.values()];
});
let observer: ResizeObserver | undefined,
  frame = 0,
  disposed = false;
function sourceElement(annotation: TextAnnotation) {
  return root.value?.querySelector<HTMLElement>(
    `[data-message-id="${CSS.escape(annotation.messageId)}"] [data-annotation-content]`,
  );
}
/** 1. 用文本偏移恢复 Range；原文变化时只接受唯一文字匹配，不将旧标注套错位置。 */
function sourceRange(annotation: TextAnnotation): Range | undefined {
  const element = sourceElement(annotation);
  if (!element) return;
  const text = element.textContent || "";
  let start = annotation.start,
    end = annotation.end;
  if (text.slice(start, end) !== annotation.text) {
    start = text.indexOf(annotation.text);
    if (start < 0 || text.indexOf(annotation.text, start + 1) >= 0) return;
    end = start + annotation.text.length;
  }
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let offset = 0,
    started = false,
    node: Node | null;
  while ((node = walker.nextNode())) {
    const length = node.textContent?.length || 0;
    if (!started && start <= offset + length) {
      range.setStart(node, Math.max(0, start - offset));
      started = true;
    }
    if (started && end <= offset + length) {
      range.setEnd(node, end - offset);
      return range;
    }
    offset += length;
  }
}
function updatePositions() {
  const host = root.value;
  if (!host) return;
  const bounds = host.getBoundingClientRect();
  const next: typeof rectangles.value = [];
  const nextBadges: typeof badges.value = [];
  const collect = (
    annotation: TextAnnotation,
    index: number,
    isFocused: boolean,
    mark: boolean,
  ) => {
    const range = sourceRange(annotation);
    if (!range) return;
    // 跨段 Range 的矩形含块级盒子；只收集实际文字，避免整行底色和文字底色重叠。
    const walker = document.createTreeWalker(
      sourceElement(annotation)!,
      NodeFilter.SHOW_TEXT,
    );
    const rects: DOMRect[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (!range.intersectsNode(node)) continue;
      const textRange = document.createRange();
      textRange.setStart(
        node,
        node === range.startContainer ? range.startOffset : 0,
      );
      textRange.setEnd(
        node,
        node === range.endContainer
          ? range.endOffset
          : node.textContent!.length,
      );
      rects.push(
        ...[...textRange.getClientRects()].filter(
          (rect) => rect.width && rect.height,
        ),
      );
    }
    for (const rect of rects)
      if (rect.bottom > bounds.top && rect.top < bounds.bottom)
        next.push({
          x: rect.left - bounds.left,
          y: rect.top - bounds.top,
          width: rect.width,
          height: rect.height,
          focused: isFocused,
        });
    const top = Math.min(...rects.map((rect) => rect.top));
    const right = Math.max(...rects.map((rect) => rect.right));
    if (mark && rects.length && top > bounds.top && top < bounds.bottom)
      nextBadges.push({
        annotation,
        index,
        x: right - bounds.left,
        y: top - bounds.top,
      });
  };
  for (const item of pending.value)
    collect(
      item.annotation,
      item.index,
      focused.value?.annotation.id === item.annotation.id,
      true,
    );
  if (
    focused.value &&
    !pending.value.some(
      (item) => item.annotation.id === focused.value?.annotation.id,
    )
  )
    collect(focused.value.annotation, focused.value.index, true, false);
  rectangles.value = next;
  badges.value = nextBadges;
}
function schedule() {
  if (!frame)
    frame = requestAnimationFrame(() => {
      frame = 0;
      updatePositions();
    });
}
function selectionChanged() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) {
    candidate.value = undefined;
    return;
  }
  const range = selection.getRangeAt(0);
  const node =
    range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement;
  const content = node?.closest<HTMLElement>("[data-annotation-content]");
  const entry = content?.closest<HTMLElement>("[data-message-id]");
  if (
    !content ||
    !entry ||
    !root.value?.contains(entry) ||
    !content.contains(range.endContainer) ||
    !range.toString().trim()
  ) {
    candidate.value = undefined;
    return;
  }
  const prefix = document.createRange();
  prefix.selectNodeContents(content);
  prefix.setEnd(range.startContainer, range.startOffset);
  const start = prefix.toString().length,
    text = range.toString();
  const rect = range.getBoundingClientRect(),
    host = root.value.getBoundingClientRect();
  candidate.value = {
    annotation: {
      id: crypto.randomUUID(),
      messageId: entry.dataset.messageId!,
      start,
      end: start + text.length,
      text,
      comment: "",
    },
    x: Math.max(0, Math.min(rect.left - host.left, host.width - 140)),
    y: Math.max(32, rect.top - host.top),
  };
}
function add() {
  if (!candidate.value) return;
  emit("add", candidate.value.annotation);
  window.getSelection()?.removeAllRanges();
  candidate.value = undefined;
}
/** 2. 引用与回答均可定位原文；缺少历史页时按原有分页入口加载，定位失败明确提示。 */
async function focusAnnotation(annotation: TextAnnotation) {
  error.value = "";
  while (!disposed && !sourceElement(annotation) && props.hasMore) {
    const previous = props.messages.length;
    await props.loadOlder();
    await nextTick();
    if (props.messages.length === previous) break;
  }
  if (disposed) return;
  const range = sourceRange(annotation);
  if (!range) {
    error.value = "未找到对应原文，原消息可能已变化或暂未加载";
    return;
  }
  const index = props.drafts.findIndex((item) => item.id === annotation.id);
  const thread = threads.value.find(
    (item) => item.annotation.id === annotation.id,
  );
  focused.value = {
    annotation,
    index: index >= 0 ? index + 1 : thread?.index || 1,
    answered: !!thread?.answered,
  };
  const element =
    range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement;
  element?.scrollIntoView({ block: "center" });
  await nextTick();
  updatePositions();
  if (index >= 0) emit("focusDraft", annotation.id);
}
watch([pending, () => props.messages], async () => {
  await nextTick();
  schedule();
});
watch([() => props.drafts, threads], ([drafts, items]) => {
  if (!focused.value) return;
  const draft = drafts.find((item) => item.id === focused.value?.annotation.id);
  const thread = items.find(
    (item) => item.annotation.id === focused.value?.annotation.id,
  );
  if ((!draft && !thread) || (!focused.value.answered && thread?.answered))
    focused.value = undefined;
  else focused.value.annotation = draft || thread!.annotation;
  schedule();
});
onMounted(() => {
  document.addEventListener("selectionchange", selectionChanged);
  root.value?.addEventListener("scroll", schedule, true);
  window.addEventListener("resize", schedule);
  observer = new ResizeObserver(schedule);
  if (root.value) observer.observe(root.value);
});
onBeforeUnmount(() => {
  disposed = true;
  cancelAnimationFrame(frame);
  observer?.disconnect();
  document.removeEventListener("selectionchange", selectionChanged);
  root.value?.removeEventListener("scroll", schedule, true);
  window.removeEventListener("resize", schedule);
});
defineExpose({ focusAnnotation });
</script>
<template>
  <div ref="root" class="message-annotation-layer">
    <slot />
    <svg class="annotation-overlays" aria-hidden="true">
      <path
        v-if="rectangles.length"
        class="annotation-highlight"
        :class="{ 'is-focused': rectangles.some((rect) => rect.focused) }"
        :d="highlightPath"
      />
    </svg>
    <button
      v-for="badge in badges"
      :key="badge.annotation.id"
      class="annotation-source-marker"
      :aria-label="`定位注释 ${badge.index}`"
      :style="{
        left: `min(${badge.x}px, calc(100% - var(--annotation-marker-size)))`,
        top: `${badge.y}px`,
      }"
      @click="focusAnnotation(badge.annotation)"
    >
      {{ badge.index }}
    </button>
    <div
      v-if="candidate"
      class="text-selection-menu"
      :style="{ left: `${candidate.x}px`, top: `${candidate.y}px` }"
      @mousedown.prevent
    >
      <button type="button" @click="add">添加到会话</button>
    </div>
    <section
      v-if="focused"
      class="annotation-detail"
      role="dialog"
      :aria-label="`注释 ${focused.index} 详情`"
    >
      <button
        class="annotation-detail-close"
        aria-label="关闭注释详情"
        @click="
          focused = undefined;
          schedule();
        "
      >
        ×
      </button>
      <small>所选文本</small>
      <p>{{ focused.annotation.text }}</p>
      <small>用户评论</small>
      <p>{{ focused.annotation.comment || "未填写评论" }}</p>
    </section>
    <p v-if="error" role="alert" class="annotation-error">{{ error }}</p>
  </div>
</template>
<style scoped>
.message-annotation-layer {
  --annotation-marker-size: 32px;
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
  flex-direction: column;
}
.annotation-overlays {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  pointer-events: none;
}
.annotation-highlight {
  fill: color-mix(in srgb, var(--annotation-blue) 30%, transparent);
}
.annotation-source-marker {
  position: absolute;
  z-index: 3;
  border: 2px solid white;
  border-radius: 50% 50% 50% 0;
  background: var(--annotation-blue);
  color: white;
  box-sizing: border-box;
  min-width: var(--annotation-marker-size);
  height: var(--annotation-marker-size);
  padding: 0 6px;
  display: grid;
  place-items: center;
  transform: translateY(-100%);
  font-size: 16px;
  line-height: 1;
  font-weight: 650;
  cursor: pointer;
}
.text-selection-menu {
  position: absolute;
  z-index: 5;
  transform: translateY(-100%);
  padding: 4px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: var(--shadow);
}
.text-selection-menu button {
  border: 0;
  background: none;
  color: var(--text);
  padding: 6px;
  cursor: pointer;
  white-space: nowrap;
}
.annotation-detail {
  position: absolute;
  z-index: 6;
  right: 16px;
  bottom: 16px;
  width: min(380px, calc(100% - 48px));
  max-height: 50%;
  overflow: auto;
  box-sizing: border-box;
  padding: 16px 30px 16px 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: var(--shadow);
  font-size: 13px;
}
.annotation-detail p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.6;
  margin: 6px 0 12px;
}
.annotation-detail small {
  color: var(--muted);
}
.annotation-detail-close {
  position: absolute;
  right: 8px;
  top: 6px;
  border: 0;
  background: none;
  color: var(--muted);
  font-size: 20px;
  cursor: pointer;
}
.annotation-error {
  position: absolute;
  bottom: 0;
  left: 16px;
  padding: 8px;
  background: var(--surface);
  color: var(--danger);
}
</style>
