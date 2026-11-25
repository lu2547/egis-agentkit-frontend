<script setup lang="ts">
import { ref, watch } from "vue";
import { renderAsync } from "docx-preview";
import { sanitizeWordDocument } from "./wordPreview";
import type { capturePreview } from "./previewCapture";
import { captureHtmlSnapshot } from "./htmlPreview";

const props = defineProps<{ blob: Blob; downloadUrl: string; name: string }>();
const host = ref<HTMLElement>();
const loading = ref(true),
  error = ref("");
let content: HTMLElement | undefined;

watch(
  [() => props.blob, host],
  async ([blob, element], _, onCleanup) => {
    if (!element) return;
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    const root = element.shadowRoot || element.attachShadow({ mode: "open" });
    onCleanup(() => {
      cancelled = true;
      observer?.disconnect();
      content = undefined;
      root.replaceChildren();
    });
    loading.value = true;
    error.value = "";
    const staged = document.createElement("div");
    try {
      // Render offscreen so an old asynchronous render can never replace a newer document.
      await renderAsync(await blob.arrayBuffer(), staged, staged, {
        breakPages: true,
        ignoreLastRenderedPageBreak: false,
        useBase64URL: true,
        renderAltChunks: false,
      });
      if (cancelled) return;
      sanitizeWordDocument(staged);
      const style = document.createElement("style");
      style.textContent =
        ".docx-wrapper{background:#e8ebef;padding:24px;min-width:max-content}.docx-wrapper>section.docx{flex-shrink:0;box-shadow:0 2px 12px #0002;margin-bottom:24px}.docx-wrapper>section.docx:last-child{margin-bottom:0}";
      staged.append(style);
      root.replaceChildren(staged);
      content = staged;
      const inherited = getComputedStyle(element);
      staged.style.fontFamily = inherited.fontFamily;
      staged.style.fontSize = inherited.fontSize;
      const fitWidth = () => {
        if (!element.clientWidth) return;
        staged.style.zoom = "1";
        staged.style.width = "";
        const width = staged.scrollWidth;
        if (!width) return;
        staged.style.width = `${width}px`;
        staged.style.zoom = String(Math.min(1, element.clientWidth / width));
      };
      fitWidth();
      observer = new ResizeObserver(fitWidth);
      observer.observe(element);
    } catch {
      if (!cancelled) error.value = "无法预览此 Word 文件，请下载后查看。";
    } finally {
      if (!cancelled) loading.value = false;
    }
  },
  { flush: "post" },
);

const capture: typeof capturePreview = (_node, regions, options) => {
  if (!content || loading.value || error.value)
    return Promise.reject(new Error("Word 页面尚未加载完成，请稍后重试"));
  const snapshot = content.cloneNode(true) as HTMLElement;
  snapshot.style.zoom = "1";
  return captureHtmlSnapshot(
    {
      html: `<html><body style="margin:0">${snapshot.outerHTML}</body></html>`,
      width: content.scrollWidth,
      height: content.scrollHeight,
    },
    regions,
    options,
  );
};
defineExpose({ capture });
</script>
<template>
  <div
    class="office-document"
    role="region"
    aria-label="Word 文档预览"
    :aria-busy="loading"
  >
    <div v-if="loading" class="empty">
      <t-loading text="正在排版 Word 文档" />
    </div>
    <div v-if="error" class="empty" role="alert">
      <p>{{ error }}</p>
      <a :href="downloadUrl" :download="name">下载文件</a>
    </div>
    <div ref="host" class="word-pages" />
  </div>
</template>
<style scoped>
.office-document {
  min-width: 100%;
  color: #000;
  font-family: Calibri, Arial, "Microsoft YaHei", sans-serif;
  font-size: 11pt;
  line-height: normal;
}
.word-pages {
  contain: inline-size layout style paint;
  isolation: isolate;
}
</style>
