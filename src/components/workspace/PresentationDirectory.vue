<script setup lang="ts">
/** 幻灯片目录：按可见范围绘制缩略图，管理定位与页面操作菜单。 */
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { MoreHorizontal } from "lucide-vue-next";
import type {
  PresentationOptions,
  PresentationSlide,
} from "../../domain/presentation";
const props = defineProps<{
  document: PDFDocumentProxy;
  slides: PresentationSlide[];
  page: number;
  options: PresentationOptions;
  editable: boolean;
  busy: boolean;
  canPaste: boolean;
}>();
const emit = defineEmits<{
  select: [page: number];
  action: [operation: string, index: number];
}>();
const root = ref<HTMLElement>(),
  list = ref<HTMLElement>();
const menu = ref<number | null>(null);
const canvases = new Map<number, HTMLCanvasElement>();
const rendered = new Set<number>(),
  queued = new Set<number>();
const queue: number[] = [];
const renders = new Map<number, RenderTask>();
let observer: IntersectionObserver | undefined,
  active = 0,
  generation = 0,
  disposed = false;

/** 1. 仅将进入目录可见区的页面加入队列，遵守服务端返回的缩略图并发和像素预算。 */
function register(node: unknown, index: number) {
  if (!(node instanceof HTMLCanvasElement)) {
    const previous = canvases.get(index);
    if (previous) observer?.unobserve(previous);
    canvases.delete(index);
    return;
  }
  canvases.set(index, node);
  node.dataset.page = String(index);
  observer?.observe(node);
}
function enqueue(index: number) {
  if (rendered.has(index) || queued.has(index) || renders.has(index)) return;
  queued.add(index);
  queue.push(index);
  flush();
}
function flush() {
  while (
    !disposed &&
    active < props.options.thumbnailConcurrency &&
    queue.length
  ) {
    const index = queue.shift()!;
    queued.delete(index);
    active++;
    void paint(index).finally(() => {
      active--;
      flush();
    });
  }
}
async function paint(index: number) {
  const current = generation,
    document = props.document,
    canvas = canvases.get(index);
  if (!canvas) return;
  try {
    const page = await document.getPage(index);
    if (disposed || current !== generation) return;
    const original = page.getViewport({ scale: 1 });
    const scale = Math.min(
      props.options.thumbnailWidth / original.width,
      Math.sqrt(
        props.options.maxThumbnailPixels / (original.width * original.height),
      ),
    );
    const viewport = page.getViewport({ scale });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const render = page.render({ canvas, viewport });
    renders.set(index, render);
    await render.promise;
    if (current === generation && !disposed) {
      rendered.add(index);
      canvas.dataset.rendered = "true";
    }
  } catch {
    if (!disposed && current === generation) canvas.dataset.failed = "true";
  } finally {
    renders.delete(index);
  }
}

/** 2. 当前页始终在目录可见范围；目录点击和页面菜单使用页码映射稳定页面身份。 */
watch(
  () => props.page,
  async () => {
    await nextTick();
    canvases
      .get(props.page)
      ?.closest(".presentation-page")
      ?.scrollIntoView({ block: "nearest" });
  },
);
function choose(index: number) {
  menu.value = null;
  emit("select", index);
}
function action(operation: string, index: number) {
  menu.value = null;
  emit("action", operation, index);
}
function outside(event: PointerEvent) {
  if (root.value && !root.value.contains(event.target as Node))
    menu.value = null;
}
onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        if (entry.isIntersecting)
          enqueue(Number((entry.target as HTMLElement).dataset.page));
    },
    { root: list.value },
  );
  for (const canvas of canvases.values()) observer.observe(canvas);
  document.addEventListener("pointerdown", outside);
});
onBeforeUnmount(() => {
  disposed = true;
  generation++;
  observer?.disconnect();
  for (const render of renders.values()) render.cancel();
  document.removeEventListener("pointerdown", outside);
});
</script>
<template>
  <nav
    ref="root"
    class="presentation-directory"
    aria-label="幻灯片目录"
    :style="{ '--directory-width': `${options.thumbnailWidth + 24}px` }"
    @keydown.esc="menu = null"
  >
    <div class="presentation-directory-heading">
      幻灯片 <span>{{ slides.length }}</span>
    </div>
    <div ref="list" class="presentation-directory-list">
      <div
        v-for="(slide, index) in slides"
        :key="slide.id"
        class="presentation-page"
        :class="{ 'is-current': page === index + 1 }"
      >
        <button
          class="presentation-page-select"
          :aria-label="`第 ${index + 1} 页：${slide.title || '空白幻灯片'}`"
          :aria-current="page === index + 1 ? 'page' : undefined"
          @click="choose(index + 1)"
          @contextmenu.prevent="
            menu = editable ? index + 1 : null;
            emit('select', index + 1);
          "
        >
          <span class="presentation-page-number">{{ index + 1 }}</span>
          <canvas
            :ref="(node) => register(node, index + 1)"
            width="0"
            height="0"
            :aria-label="`第 ${index + 1} 页缩略图`"
          />
          <span class="presentation-page-title">{{
            slide.title || "空白幻灯片"
          }}</span>
        </button>
        <button
          v-if="editable"
          class="presentation-page-more"
          :disabled="busy"
          :aria-label="`第 ${index + 1} 页操作`"
          @click.stop="menu = menu === index + 1 ? null : index + 1"
        >
          <MoreHorizontal :size="16" />
        </button>
        <div
          v-if="menu === index + 1"
          class="presentation-page-menu"
          role="menu"
        >
          <button
            role="menuitem"
            :disabled="busy"
            @click="action('copy', index + 1)"
          >
            复制
          </button>
          <button
            role="menuitem"
            :disabled="busy || !canPaste || slides.length >= options.maxSlides"
            @click="action('paste', index + 1)"
          >
            粘贴
          </button>
          <button
            role="menuitem"
            :disabled="busy || slides.length <= 1"
            @click="action('remove', index + 1)"
          >
            删除
          </button>
          <button
            role="menuitem"
            :disabled="busy || index === 0"
            @click="action('move_up', index + 1)"
          >
            向上移动
          </button>
          <button
            role="menuitem"
            :disabled="busy || index === slides.length - 1"
            @click="action('move_down', index + 1)"
          >
            向下移动
          </button>
        </div>
      </div>
    </div>
  </nav>
</template>
<style scoped>
.presentation-directory {
  display: flex;
  flex-direction: column;
  flex: none;
  width: var(--directory-width);
  min-height: 0;
  background: var(--hover);
  border-right: 1px solid var(--line);
  font-size: 11px;
  text-align: left;
}
.presentation-directory-heading {
  display: flex;
  justify-content: space-between;
  padding: 12px;
  color: var(--muted);
  border-bottom: 1px solid var(--line);
}
.presentation-directory-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px 8px;
}
.presentation-page {
  position: relative;
  margin-bottom: 10px;
  border: 2px solid transparent;
  border-radius: 6px;
}
.presentation-page.is-current {
  border-color: var(--text);
  background: var(--surface);
}
.presentation-page-select {
  display: block;
  position: relative;
  width: 100%;
  padding: 6px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  text-align: left;
}
.presentation-page-select:hover {
  background: var(--surface);
}
.presentation-page-select:focus-visible,
.presentation-page-more:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
.presentation-page-number {
  display: block;
  color: var(--muted);
  margin-bottom: 5px;
  font-size: 10px;
}
.presentation-page-select canvas {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 16/9;
  background: var(--bg);
  border: 1px solid var(--line);
  object-fit: contain;
}
.presentation-page-title {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 6px;
  font-size: 10px;
}
.presentation-page-more {
  position: absolute;
  right: 5px;
  top: 3px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 4px;
  padding: 2px;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}
.presentation-page-menu {
  position: absolute;
  top: 26px;
  right: 4px;
  z-index: 5;
  min-width: 112px;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 4px;
  background: var(--surface);
  box-shadow: var(--card-shadow);
}
.presentation-page-menu button {
  display: block;
  width: 100%;
  border: 0;
  background: none;
  color: var(--text);
  padding: 8px;
  text-align: left;
  cursor: pointer;
  font-size: 11px;
  border-radius: 4px;
}
.presentation-page-menu button:hover {
  background: var(--hover);
}
.presentation-page-menu button:disabled {
  opacity: 0.35;
  cursor: default;
}
</style>
