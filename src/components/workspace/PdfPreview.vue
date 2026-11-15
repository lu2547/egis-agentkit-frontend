<script setup lang="ts">
/** PDF 文稿控制器：管理源文件、缩放和页码；PPT 使用连续页面流与目录联动。 */
import PdfPreviewPage from "./PdfPreviewPage.vue";
import type {
  PreviewAnchor,
  PreviewOptions,
  PreviewReference,
  PreviewAcceptance,
} from "../../domain/previewReferences";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  shallowRef,
} from "vue";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-vue-next";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
GlobalWorkerOptions.workerSrc = workerUrl;
const props = withDefaults(
  defineProps<{
    blob: Blob;
    source?: Pick<PreviewAnchor, "projectId" | "area" | "path" | "checksum">;
    options?: PreviewOptions;
    anchor?: PreviewAnchor;
    initialPage?: number;
    interactionDisabled?: boolean;
    continuous?: boolean;
  }>(),
  { continuous: false },
);
const emit = defineEmits<{
  reference: [value: PreviewReference, accept: PreviewAcceptance];
  pageChange: [page: number];
}>();
const pageHost = ref<HTMLElement>(),
  pdfDocument = shallowRef<PDFDocumentProxy>();
const page = ref(1),
  count = ref(0),
  zoom = ref(1),
  error = ref(""),
  loading = ref(true),
  width = ref(0),
  aspect = ref(16 / 9);
const rendered = ref(new Set<number>());
const painting = computed(
  () => loading.value || !rendered.value.has(page.value),
);
const pages = computed(() =>
  props.continuous
    ? Array.from({ length: count.value }, (_, i) => i + 1)
    : [page.value],
);
const sheets = new Map<number, HTMLElement>();
let task: ReturnType<typeof getDocument> | undefined,
  generation = 0;
let observer: ResizeObserver | undefined,
  scrollFrame = 0;

/** 1. 读取同一版本 PDF；源文件变更重建页面，普通缩放与滚动保留页面实例。 */
watch(
  () => props.blob,
  async (blob) => {
    const current = ++generation;
    void task?.destroy();
    pdfDocument.value = undefined;
    rendered.value = new Set();
    error.value = "";
    loading.value = true;
    page.value = props.anchor?.page || props.initialPage || 1;
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
        maxImageSize: 16_000_000,
      });
      const loaded = await task.promise;
      const first = await loaded.getPage(1);
      if (current !== generation) return;
      const viewport = first.getViewport({ scale: 1 });
      aspect.value = viewport.width / viewport.height;
      count.value = loaded.numPages;
      page.value = Math.min(page.value, count.value);
      pdfDocument.value = loaded;
      loading.value = false;
      await nextTick();
      scrollToPage();
    } catch {
      if (current === generation) {
        error.value = "无法打开 PDF，文件可能已加密或损坏。";
        loading.value = false;
      }
    }
  },
  { immediate: true },
);
function register(node: unknown, index: number) {
  if (node instanceof HTMLElement) sheets.set(index, node);
  else sheets.delete(index);
}
function setReady(index: number, ready: boolean) {
  if (ready) rendered.value.add(index);
  else rendered.value.delete(index);
}

/** 2. 目录、翻页和历史引用定位滚动到真实页面；滚动只更新页码，不反向触发跳转。 */
function scrollToPage() {
  if (!props.continuous || !pageHost.value) return;
  const target = sheets.get(page.value);
  if (!target) return;
  const root = pageHost.value;
  root.scrollTo({
    top:
      root.scrollTop +
      target.getBoundingClientRect().top -
      root.getBoundingClientRect().top,
  });
}
async function selectPage(value: number) {
  page.value = Math.max(1, Math.min(count.value || 1, Number(value)));
  await nextTick();
  scrollToPage();
}
function syncScroll() {
  if (!props.continuous || scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0;
    const root = pageHost.value;
    if (!root) return;
    const top = root.getBoundingClientRect().top,
      bottom = top + root.clientHeight;
    // 取显示面积最大的页面；最后一页无法顶齐视窗上缘时，也能正确切换当前页。
    let visibleHeight = 0,
      current = page.value;
    for (const [index, node] of sheets) {
      const bounds = node.getBoundingClientRect();
      const height =
        Math.min(bounds.bottom, bottom) - Math.max(bounds.top, top);
      if (height > visibleHeight) {
        visibleHeight = height;
        current = index;
      }
    }
    page.value = current;
  });
}
watch(
  () => props.anchor,
  (anchor) => {
    if (anchor) void selectPage(anchor.page);
  },
);
watch(page, (value) => emit("pageChange", value));
watch([zoom, width], async () => {
  await nextTick();
  scrollToPage();
});

/** 3. 仅观察正文可用宽度；目录展开不挤压或错置框选坐标。 */
onMounted(() => {
  observer = new ResizeObserver((entries) => {
    const size = Math.max(
      0,
      Math.floor(entries[0]?.contentRect.width || 0) - 24,
    );
    if (size !== width.value) width.value = size;
  });
  if (pageHost.value) observer.observe(pageHost.value);
});
watch(
  pageHost,
  (node, old) => {
    if (old) observer?.unobserve(old);
    if (node) observer?.observe(node);
  },
  { flush: "post" },
);
onBeforeUnmount(() => {
  generation++;
  observer?.disconnect();
  cancelAnimationFrame(scrollFrame);
  void task?.destroy();
});
</script>
<template>
  <div class="pdf-preview" aria-label="PDF 页面预览">
    <nav class="pdf-toolbar" aria-label="PDF 翻页和缩放">
      <button
        aria-label="上一页"
        :disabled="page <= 1"
        @click="selectPage(page - 1)"
      >
        <ChevronLeft :size="16" />
      </button>
      <span>{{ page }} / {{ count || "—" }}</span>
      <select
        v-if="count > 1"
        :value="page"
        aria-label="跳转文档页码"
        @change="selectPage(Number(($event.target as HTMLSelectElement).value))"
      >
        <option v-for="n in count" :key="n" :value="n">第 {{ n }} 页</option>
      </select>
      <button
        aria-label="下一页"
        :disabled="page >= count"
        @click="selectPage(page + 1)"
      >
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
    <div v-else class="pdf-layout">
      <slot
        name="directory"
        :document="pdfDocument"
        :count="count"
        :page="page"
        :select-page="selectPage"
      />
      <div
        ref="pageHost"
        class="pdf-pages"
        :class="{ 'is-continuous': continuous }"
        :aria-busy="painting"
        @scroll.passive="syncScroll"
      >
        <p v-if="loading" class="pdf-loading">正在读取页面…</p>
        <template v-if="pdfDocument">
          <div
            v-for="n in pages"
            :key="`${generation}-${n}`"
            :ref="(node) => register(node, n)"
            :class="
              continuous
                ? ['presentation-sheet', { 'is-current': page === n }]
                : 'pdf-single-sheet'
            "
            @pointerdown.capture="page = n"
            @focusin="page = n"
          >
            <PdfPreviewPage
              :document="pdfDocument"
              :page="n"
              :width="width"
              :zoom="zoom"
              :aspect="aspect"
              :continuous="continuous"
              :active="page === n"
              :scroll-root="pageHost"
              :source="source"
              :options="options"
              :anchor="anchor"
              :disabled="interactionDisabled"
              @ready="(ready) => setReady(n, ready)"
              @reference="(value, accept) => emit('reference', value, accept)"
            />
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
<style scoped src="../../styles/components/pdf-preview.css"></style>
