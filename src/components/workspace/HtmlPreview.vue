<script setup lang="ts">
/** HTML 文档预览：保留交互和样式，通过隔离消息桥提供尺寸与静态框选快照。 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import PreviewSelection from "./PreviewSelection.vue";
import {
  interactiveHtml,
  captureHtmlSnapshot,
  type HtmlSnapshot,
} from "./htmlPreview";
import type {
  PreviewAnchor,
  PreviewOptions,
  PreviewReference,
  PreviewAcceptance,
  PreviewRegion,
} from "../../domain/previewReferences";
const props = defineProps<{
  content: string;
  source?: Pick<PreviewAnchor, "projectId" | "area" | "path" | "checksum">;
  options?: PreviewOptions;
  anchor?: PreviewAnchor;
}>();
const emit = defineEmits<{
  reference: [value: PreviewReference, accept: PreviewAcceptance];
}>();
const frame = ref<HTMLIFrameElement>();
const channel = crypto.randomUUID();
const documentHtml = computed(() => interactiveHtml(props.content, channel));
const height = ref(300),
  width = ref<number>();
const pending = new Map<
  string,
  {
    resolve: (value: HtmlSnapshot) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
function message(event: MessageEvent) {
  const data = event.data;
  if (event.source !== frame.value?.contentWindow || data?.channel !== channel)
    return;
  if (
    data.type === "size" &&
    Number.isFinite(data.width) &&
    Number.isFinite(data.height) &&
    data.width > 0 &&
    data.height > 0
  ) {
    height.value = data.height;
    if (frame.value && data.width > frame.value.clientWidth)
      width.value = data.width;
  }
  if (data.type === "capture" && typeof data.requestId === "string") {
    const request = pending.get(data.requestId);
    if (!request) return;
    pending.delete(data.requestId);
    clearTimeout(request.timer);
    if (
      typeof data.html === "string" &&
      Number.isFinite(data.width) &&
      Number.isFinite(data.height) &&
      data.width > 0 &&
      data.height > 0
    )
      request.resolve({
        html: data.html,
        width: data.width,
        height: data.height,
      });
    else request.reject(new Error("无法生成 HTML 页面快照"));
  }
}
async function capture(
  _node: HTMLElement,
  regions: PreviewRegion[],
  options: PreviewOptions,
) {
  const requestId = crypto.randomUUID();
  const snapshot = await new Promise<HtmlSnapshot>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error("生成 HTML 引用超时，请重试"));
    }, options.captureTimeoutMs);
    pending.set(requestId, { resolve, reject, timer });
    frame.value?.contentWindow?.postMessage(
      { channel, type: "capture", requestId },
      "*",
    );
  });
  return captureHtmlSnapshot(snapshot, regions, options);
}
onMounted(() => window.addEventListener("message", message));
onBeforeUnmount(() => {
  window.removeEventListener("message", message);
  for (const request of pending.values()) {
    clearTimeout(request.timer);
    request.reject(new Error("HTML 预览已关闭"));
  }
  pending.clear();
});
</script>
<template>
  <PreviewSelection
    :source="source"
    :options="options"
    :anchor="anchor"
    :capture="capture"
    @reference="(value, accept) => emit('reference', value, accept)"
  >
    <iframe
      ref="frame"
      :srcdoc="documentHtml"
      sandbox="allow-scripts"
      referrerpolicy="no-referrer"
      title="隔离的 HTML 预览"
      class="html-preview"
      :style="{
        height: `${height}px`,
        width: '100%',
        minWidth: width ? `${width}px` : undefined,
      }"
    />
  </PreviewSelection>
</template>
<style scoped>
.html-preview {
  display: block;
  border: 0;
  min-height: 300px;
  background: var(--document-bg);
}
</style>
