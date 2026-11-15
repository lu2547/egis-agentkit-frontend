<script setup lang="ts">
/** 单页画布与引用：按可见范围绘制，离屏释放像素，框选始终绑定本页。 */
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from "vue";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import PreviewSelection from "./PreviewSelection.vue";
import {
  extractRegionText,
  pdfTextFragment,
  type PreviewTextFragment,
} from "../../domain/previewText";
import type {
  PreviewAnchor,
  PreviewOptions,
  PreviewReference,
  PreviewAcceptance,
} from "../../domain/previewReferences";

const props = defineProps<{
  document: PDFDocumentProxy;
  page: number;
  width: number;
  zoom: number;
  aspect: number;
  continuous: boolean;
  active: boolean;
  scrollRoot?: HTMLElement;
  source?: Pick<PreviewAnchor, "projectId" | "area" | "path" | "checksum">;
  options?: PreviewOptions;
  anchor?: PreviewAnchor;
  disabled?: boolean;
}>();
const emit = defineEmits<{
  reference: [value: PreviewReference, accept: PreviewAcceptance];
  ready: [value: boolean];
}>();
// 延续原画布预算；连续模式只保留视窗及前后一屏的画布，不分配整篇文稿像素。
const MAX_RENDER_PIXELS = 16_000_000,
  MAX_DEVICE_SCALE = 2,
  MAX_PAGE_SCALE = 3;
const host = ref<HTMLElement>(),
  canvas = ref<HTMLCanvasElement>();
const near = ref(!props.continuous),
  ready = ref(false),
  error = ref("");
const aspect = ref(props.aspect),
  pageWidth = ref(0);
const fragments = shallowRef<PreviewTextFragment[]>([]);
const size = computed(() => {
  const w = pageWidth.value
    ? Math.min((props.width / pageWidth.value) * props.zoom, MAX_PAGE_SCALE) *
      pageWidth.value
    : props.width * props.zoom;
  return { width: `${w}px`, height: `${w / aspect.value}px` };
});
let observer: IntersectionObserver | undefined,
  render: RenderTask | undefined,
  generation = 0;

/** 1. 可见时读取本页文字与坐标；缩放和宽度变化只重绘，不清空本页框选。 */
async function draw() {
  const current = ++generation,
    previous = render;
  previous?.cancel();
  await previous?.promise.catch(() => {});
  if (current !== generation || !canvas.value) return;
  ready.value = false;
  emit("ready", false);
  const target = canvas.value;
  delete target.dataset.rendered;
  if (!near.value || props.width <= 0) {
    target.width = target.height = 0;
    return;
  }
  error.value = "";
  try {
    const pdfPage = await props.document.getPage(props.page);
    const text = await pdfPage.getTextContent();
    if (current !== generation) return;
    const original = pdfPage.getViewport({ scale: 1 });
    aspect.value = original.width / original.height;
    pageWidth.value = original.width;
    fragments.value = text.items.flatMap((item) =>
      "str" in item ? [pdfTextFragment(item, original)] : [],
    );
    const viewport = pdfPage.getViewport({
      scale: Math.min(
        (props.width / original.width) * props.zoom,
        MAX_PAGE_SCALE,
      ),
    });
    const ratio = Math.min(
      window.devicePixelRatio || 1,
      MAX_DEVICE_SCALE,
      Math.sqrt(MAX_RENDER_PIXELS / (viewport.width * viewport.height)),
    );
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
    if (current === generation) {
      target.dataset.rendered = "true";
      ready.value = true;
      emit("ready", true);
    }
  } catch (reason) {
    if (
      current === generation &&
      (reason as Error).name !== "RenderingCancelledException"
    )
      error.value = "无法显示此 PDF 页面，请检查文件是否损坏或加密。";
  }
}
watch([near, () => props.width, () => props.zoom], () => void draw(), {
  flush: "post",
});
onMounted(() => {
  if (props.continuous) {
    observer = new IntersectionObserver(
      (entries) => {
        near.value = entries.some((entry) => entry.isIntersecting);
      },
      { root: props.scrollRoot, rootMargin: "100% 0px" },
    );
    if (host.value) observer.observe(host.value);
  } else void draw();
});
/** 2. 离开预览立即取消绘制；页内引用的坐标、文字和截图都取自同一画布。 */
onBeforeUnmount(() => {
  generation++;
  observer?.disconnect();
  render?.cancel();
});
</script>
<template>
  <section
    ref="host"
    class="pdf-page"
    :class="{ 'is-current': active }"
    :aria-label="`第 ${page} 页正文`"
    :aria-busy="!ready"
    :data-page="page"
  >
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <PreviewSelection
      :source="source"
      :options="options"
      :page="page"
      :page-count="document.numPages"
      :anchor="anchor?.page === page ? anchor : undefined"
      :toolbar-visible="!continuous || active"
      :disabled="!ready || disabled"
      :resolve-excerpt="(regions) => extractRegionText(fragments, regions)"
      @reference="(value, accept) => emit('reference', value, accept)"
    >
      <div class="pdf-page-surface" :style="size">
        <canvas ref="canvas" width="0" height="0" aria-label="文档页面" />
      </div>
    </PreviewSelection>
  </section>
</template>
<style scoped>
.pdf-page {
  min-width: 0;
  position: relative;
  flex: none;
}
.pdf-page-surface {
  position: relative;
  background: #fff;
}
canvas {
  display: block;
}
.error {
  padding: 8px;
  color: var(--error, #c43b32);
}
</style>
