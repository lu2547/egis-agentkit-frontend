<script setup lang="ts">
/** 在预览内容上绘制归一化区域，生成带标注的页面图片并送回聊天草稿。 */
import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
  normalizeRegion,
  type PreviewAnchor,
  type PreviewOptions,
  type PreviewAcceptance,
  type PreviewReference,
  type PreviewRegion,
} from "../../domain/previewReferences";
import { capturePreview } from "./previewCapture";
const props = withDefaults(
  defineProps<{
    source?: Pick<PreviewAnchor, "projectId" | "area" | "path" | "checksum">;
    options?: PreviewOptions;
    page?: number;
    pageCount?: number;
    anchor?: PreviewAnchor;
    disabled?: boolean;
    toolbarVisible?: boolean;
    capture?: typeof capturePreview;
    excerpt?: string;
    resolveExcerpt?: (regions: PreviewRegion[]) => string;
  }>(),
  { page: 1, pageCount: 1, toolbarVisible: true },
);
const emit = defineEmits<{
  reference: [value: PreviewReference, accept: PreviewAcceptance];
}>();
const content = ref<HTMLElement>(),
  layer = ref<HTMLElement>();
const drawing = ref(false),
  busy = ref(false),
  error = ref(""),
  selected = ref("");
const regions = ref<PreviewRegion[]>([]);
let generation = 0;
let active:
  | {
      pointer: number;
      start: { x: number; y: number };
      bounds: DOMRect;
      region: PreviewRegion;
      kind: "draw" | "move" | "resize";
    }
  | undefined;
const key = computed(
  () =>
    `${props.source?.projectId}:${props.source?.area}:${props.source?.path}:${props.source?.checksum}:${props.page}`,
);
watch(
  [key, () => props.anchor],
  () => {
    generation++;
    active = undefined;
    busy.value = false;
    drawing.value = false;
    selected.value = "";
    error.value = "";
    const a = props.anchor;
    regions.value =
      a && a.checksum === props.source?.checksum && a.page === props.page
        ? a.regions.map((r) => ({ ...r }))
        : [];
  },
  { immediate: true },
);
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) {
      generation++;
      busy.value = false;
      active = undefined;
    }
  },
);
onBeforeUnmount(() => generation++);
function start(event: PointerEvent) {
  if (
    busy.value ||
    props.disabled ||
    event.button !== 0 ||
    !layer.value ||
    !props.options
  )
    return;
  const element = event.target as HTMLElement;
  const id = element.closest<HTMLElement>("[data-region]")?.dataset.region;
  const existing = regions.value.find((r) => r.id === id);
  if (!drawing.value && !existing) return;
  const bounds = layer.value.getBoundingClientRect();
  const point = {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  };
  if (!existing && regions.value.length >= props.options.maxRegions) {
    error.value = `每页最多框选 ${props.options.maxRegions} 个区域`;
    return;
  }
  const region = existing || {
    id: crypto.randomUUID(),
    x: point.x / bounds.width,
    y: point.y / bounds.height,
    width: 0,
    height: 0,
    note: "",
  };
  active = {
    pointer: event.pointerId,
    start: point,
    bounds,
    region: { ...region },
    kind: existing ? (element.dataset.resize ? "resize" : "move") : "draw",
  };
  if (!existing) regions.value = [...regions.value, region];
  selected.value = region.id;
  layer.value.focus({ preventScroll: true });
  layer.value.setPointerCapture(event.pointerId);
  event.preventDefault();
}
function move(event: PointerEvent) {
  if (!active || event.pointerId !== active.pointer) return;
  const { bounds, start, region, kind } = active;
  const current = {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  };
  const target = regions.value.find((r) => r.id === region.id);
  if (!target) return;
  if (kind === "draw")
    Object.assign(target, normalizeRegion(start, current, bounds));
  else if (kind === "resize")
    Object.assign(
      target,
      normalizeRegion(
        { x: region.x * bounds.width, y: region.y * bounds.height },
        current,
        bounds,
      ),
    );
  else {
    target.x = Math.max(
      0,
      Math.min(
        1 - target.width,
        region.x + (current.x - start.x) / bounds.width,
      ),
    );
    target.y = Math.max(
      0,
      Math.min(
        1 - target.height,
        region.y + (current.y - start.y) / bounds.height,
      ),
    );
  }
}
function end(event: PointerEvent) {
  if (!active || event.pointerId !== active.pointer) return;
  const { region, bounds } = active;
  const target = regions.value.find((r) => r.id === region.id);
  if (
    target &&
    props.options &&
    (target.width * bounds.width < props.options.minRegionPixels ||
      target.height * bounds.height < props.options.minRegionPixels)
  )
    regions.value = regions.value.filter((r) => r.id !== region.id);
  active = undefined;
  if (layer.value?.hasPointerCapture(event.pointerId))
    layer.value.releasePointerCapture(event.pointerId);
}
function clear() {
  regions.value = [];
  selected.value = "";
  error.value = "";
}
async function addReference() {
  if (
    !props.source ||
    !props.options ||
    !content.value ||
    busy.value ||
    props.disabled
  )
    return;
  const current = generation,
    source = { ...props.source },
    page = props.page,
    pageCount = props.pageCount;
  const saved = regions.value.map((r) => ({ ...r }));
  busy.value = true;
  error.value = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const snapshot = await Promise.race([
      (props.capture || capturePreview)(content.value, saved, props.options),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("生成引用超时，请重试")),
          props.options!.captureTimeoutMs,
        );
      }),
    ]);
    if (current !== generation) return;
    emit(
      "reference",
      {
        ...source,
        ...snapshot,
        excerpt: (props.resolveExcerpt
          ? props.resolveExcerpt(saved)
          : props.excerpt || snapshot.excerpt
        ).slice(0, props.options.maxExcerptChars),
        id: crypto.randomUUID(),
        page,
        pageCount,
        regions: saved,
      },
      (accepted) => {
        if (accepted && current === generation) {
          clear();
          drawing.value = false;
        }
      },
    );
  } catch (e) {
    if (current === generation)
      error.value = (e as Error).message || "无法生成引用图片";
  } finally {
    clearTimeout(timer);
    if (current === generation) busy.value = false;
  }
}
</script>
<template>
  <div class="preview-selection" @keydown.esc="drawing = false">
    <nav
      v-if="source && options && toolbarVisible"
      class="selection-toolbar"
      aria-label="文件框选引用"
    >
      <button
        :aria-pressed="drawing"
        :disabled="disabled || busy"
        @click="drawing = !drawing"
      >
        框选
      </button>
      <button :disabled="!regions.length || busy" @click="regions.pop()">
        撤销
      </button>
      <button :disabled="!regions.length || busy" @click="clear">清空</button>
      <span class="selection-hint">{{
        drawing ? "拖动框选区域" : `${regions.length} 个区域`
      }}</span>
      <button
        class="quote-action"
        :disabled="disabled || busy"
        @click="addReference"
      >
        {{ busy ? "生成引用…" : "加入对话" }}
      </button>
    </nav>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div class="selection-scroll">
      <div class="selection-stage">
        <div ref="content" class="selection-content"><slot /></div>
        <div
          v-if="source && options"
          ref="layer"
          class="selection-layer"
          :class="{ drawing }"
          tabindex="0"
          aria-label="文件框选区域"
          @keydown.delete.prevent="
            regions = regions.filter((r) => r.id !== selected)
          "
          @pointerdown="start"
          @pointermove="move"
          @pointerup="end"
          @pointercancel="end"
        >
          <div
            v-for="(region, index) in regions"
            :key="region.id"
            class="selection-region"
            :class="{ selected: region.id === selected }"
            :data-region="region.id"
            :style="{
              left: `${region.x * 100}%`,
              top: `${region.y * 100}%`,
              width: `${region.width * 100}%`,
              height: `${region.height * 100}%`,
            }"
          >
            <span class="region-number">{{ index + 1 }}</span
            ><span data-resize="true" class="region-resize" />
          </div>
        </div>
      </div>
    </div>
    <div v-if="regions.length" class="region-notes">
      <label v-for="(region, index) in regions" :key="region.id"
        >区域 {{ index + 1 }}
        <input
          v-model="region.note"
          :maxlength="options?.maxNoteChars"
          :aria-label="`区域 ${index + 1} 备注`"
          placeholder="描述要修改或讨论的内容"
        />
        <button
          :aria-label="`移除区域 ${index + 1}`"
          @click="regions = regions.filter((r) => r.id !== region.id)"
        >
          ×
        </button>
      </label>
    </div>
  </div>
</template>
<style scoped>
.preview-selection {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  min-width: 0;
}
.selection-toolbar {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--line);
  font-size: 12px;
  background: var(--surface);
  flex-shrink: 0;
}
.selection-toolbar button,
.region-notes button {
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  padding: 5px 9px;
  cursor: pointer;
}
.selection-toolbar button[aria-pressed="true"] {
  background: var(--text);
  color: var(--bg);
}
.selection-toolbar button:disabled {
  opacity: 0.4;
  cursor: default;
}
.selection-hint {
  flex: 1;
  color: var(--muted);
  font-size: 11px;
  white-space: nowrap;
}
.selection-toolbar .quote-action {
  background: var(--text);
  color: var(--bg);
  white-space: nowrap;
}
.selection-scroll {
  overflow: auto;
  min-height: 0;
  flex: 1;
}
.selection-stage {
  position: relative;
  width: fit-content;
  min-width: 100%;
}
.selection-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  outline: none;
  touch-action: none;
}
.selection-layer.drawing {
  pointer-events: auto;
  cursor: crosshair;
}
.selection-region {
  position: absolute;
  box-sizing: border-box;
  border: 2px dashed #ef4444;
  background: #ef444415;
  pointer-events: auto;
  cursor: move;
}
.region-number {
  position: absolute;
  top: 0;
  left: 0;
  background: #ef4444;
  color: white;
  font-size: 11px;
  padding: 0 3px;
}
.region-resize {
  position: absolute;
  right: -5px;
  bottom: -5px;
  width: 10px;
  height: 10px;
  background: #fff;
  border: 1px solid #ef4444;
  cursor: nwse-resize;
}
.region-notes {
  padding: 8px 12px;
  border-top: 1px solid var(--line);
  font-size: 12px;
  max-height: 140px;
  overflow: auto;
  flex-shrink: 0;
}
.region-notes label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0;
}
.region-notes input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  padding: 6px;
}
.error {
  padding: 8px 12px;
  font-size: 12px;
}
</style>
