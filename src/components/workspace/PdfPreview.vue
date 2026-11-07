<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-vue-next";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type RenderTask,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
GlobalWorkerOptions.workerSrc = workerUrl;
const props = defineProps<{ blob: Blob }>();
const host = ref<HTMLElement>();
const canvas = ref<HTMLCanvasElement>();
const page = ref(1),
  count = ref(0),
  zoom = ref(1),
  error = ref(""),
  loading = ref(true),
  width = ref(0);
let document: PDFDocumentProxy | undefined;
let task: ReturnType<typeof getDocument> | undefined;
let render: RenderTask | undefined;
let generation = 0,
  painting = 0;
let observer: ResizeObserver | undefined;
async function draw() {
  const current = ++painting;
  if (!document || !canvas.value || width.value < 1) return;
  const previous = render;
  previous?.cancel();
  await previous?.promise.catch(() => {});
  if (current !== painting || !document || !canvas.value) return;
  try {
    const pdfPage = await document.getPage(page.value);
    if (current !== painting || !canvas.value) return;
    const original = pdfPage.getViewport({ scale: 1 });
    const scale = Math.min(
      ((width.value - 24) / original.width) * zoom.value,
      3,
    );
    const viewport = pdfPage.getViewport({ scale: Math.max(0.1, scale) });
    const ratio = Math.min(
      window.devicePixelRatio || 1,
      2,
      Math.sqrt(16000000 / (viewport.width * viewport.height)),
    );
    const target = canvas.value;
    target.width = Math.ceil(viewport.width * ratio);
    target.height = Math.ceil(viewport.height * ratio);
    target.style.width = `${viewport.width}px`;
    target.style.height = `${viewport.height}px`;
    render = pdfPage.render({
      canvas: target,
      viewport,
      transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
    });
    await render.promise;
    if (current === painting) loading.value = false;
  } catch (e) {
    if (
      current === painting &&
      (e as Error).name !== "RenderingCancelledException"
    )
      error.value = "无法显示此 PDF 页面，请检查文件是否损坏或加密。";
  }
}
watch(
  () => props.blob,
  async (blob) => {
    const current = ++generation;
    painting++;
    render?.cancel();
    void task?.destroy();
    document = undefined;
    error.value = "";
    loading.value = true;
    page.value = 1;
    count.value = 0;
    try {
      const data = new Uint8Array(await blob.arrayBuffer());
      if (current !== generation) return;
      task = getDocument({
        data,
        cMapUrl: "/pdfjs/cmaps/",
        cMapPacked: true,
        standardFontDataUrl: "/pdfjs/standard_fonts/",
        wasmUrl: "/pdfjs/wasm/",
        maxImageSize: 16000000,
      });
      const loaded = await task.promise;
      if (current !== generation) {
        return;
      }
      document = loaded;
      count.value = loaded.numPages;
      await draw();
    } catch {
      if (current === generation) {
        error.value = "无法打开 PDF，文件可能已加密或损坏。";
        loading.value = false;
      }
    }
  },
  { immediate: true },
);
watch([page, zoom, width], () => {
  void draw();
});
onMounted(() => {
  observer = new ResizeObserver((entries) => {
    const size = Math.floor(entries[0]?.contentRect.width || 0);
    if (size !== width.value) width.value = size;
  });
  if (host.value) observer.observe(host.value);
});
onBeforeUnmount(() => {
  generation++;
  painting++;
  observer?.disconnect();
  render?.cancel();
  void task?.destroy();
});
</script>
<template>
  <div ref="host" class="pdf-preview" aria-label="PDF 页面预览">
    <nav class="pdf-toolbar" aria-label="PDF 翻页和缩放">
      <button aria-label="上一页" :disabled="page <= 1" @click="page--">
        <ChevronLeft :size="16" />
      </button>
      <span>{{ page }} / {{ count || "—" }}</span>
      <button aria-label="下一页" :disabled="page >= count" @click="page++">
        <ChevronRight :size="16" />
      </button>
      <span class="pdf-divider" />
      <button
        aria-label="缩小"
        :disabled="zoom <= 0.5"
        @click="zoom = Math.max(0.5, zoom - 0.25)"
      >
        <Minus :size="16" />
      </button>
      <span>{{ Math.round(zoom * 100) }}%</span>
      <button
        aria-label="放大"
        :disabled="zoom >= 2"
        @click="zoom = Math.min(2, zoom + 0.25)"
      >
        <Plus :size="16" />
      </button>
    </nav>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div v-else class="pdf-pages" :aria-busy="loading">
      <p v-if="loading" class="pdf-loading">正在绘制页面…</p>
      <canvas ref="canvas" aria-label="文档页面" />
    </div>
  </div>
</template>
<style scoped src="../../styles/components/pdf-preview.css"></style>
