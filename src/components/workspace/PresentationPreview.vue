<script setup lang="ts">
/** 项目 PPT 预览：组合缩略图目录、页面管理、原始文件保存与框选引用。 */
import { computed, onMounted, onBeforeUnmount, ref, shallowRef } from "vue";
import { onBeforeRouteLeave, onBeforeRouteUpdate } from "vue-router";
import { List, Plus, Download } from "lucide-vue-next";
import { http, requestRaw, errorText, json, ApiError } from "../../api/http";
import { workspacePath } from "../../api/manager";
import type {
  PreviewAnchor,
  PreviewOptions,
  PreviewReference,
  PreviewAcceptance,
} from "../../domain/previewReferences";
import type {
  PresentationInfo,
  PresentationSlide,
  PresentationOptions,
  SlideOperation,
} from "../../domain/presentation";
import PdfPreview from "./PdfPreview.vue";
import PresentationDirectory from "./PresentationDirectory.vue";

const props = defineProps<{
  blob?: Blob | null;
  initialInfo?: PresentationInfo;
  source: Pick<PreviewAnchor, "projectId" | "area" | "path" | "checksum">;
  options: PreviewOptions;
  anchor?: PreviewAnchor;
}>();
const emit = defineEmits<{
  reference: [value: PreviewReference, accept: PreviewAcceptance];
  saved: [checksum: string];
}>();
const pdf = shallowRef<Blob | null>(props.blob || null);
const pdfSlideIds = ref<string[]>([]);
const renderedChecksum = ref(props.blob ? props.source.checksum : "");
const refreshing = ref(false);
const slides = ref<PresentationSlide[]>([]),
  settings = ref<PresentationOptions>();
const current = ref(props.anchor?.page || 1),
  initialPage = ref(props.anchor?.page || 1),
  directory = ref(true),
  busy = ref(false),
  loading = ref(true);
const error = ref(""),
  previewFailed = ref(false),
  clipboard = ref(""),
  checksum = ref(props.source.checksum);
const path = workspacePath(props.source.projectId),
  query = { area: props.source.area, path: props.source.path };
const editable = computed(
  () =>
    /\.pptx$/i.test(props.source.path) &&
    slides.value.length > 0 &&
    !loading.value,
);
const readySource = computed(() =>
  !previewFailed.value &&
  !refreshing.value &&
  renderedChecksum.value === checksum.value &&
  !busy.value &&
  (!editable.value || checksum.value === props.source.checksum)
    ? { ...props.source, checksum: checksum.value }
    : undefined,
);
const locatedAnchor = computed(() =>
  props.anchor?.checksum === checksum.value ? props.anchor : undefined,
);
const controller = new AbortController();
let disposed = false,
  previewGeneration = 0;
let fullController: AbortController | undefined,
  pageController: AbortController | undefined;

/** 1. 读取源文件版本的页面目录与预算；旧 PPT 仍有目录，但不伪装成可写 PPTX。 */
async function loadDirectory() {
  loading.value = true;
  error.value = "";
  try {
    if (/\.pptx$/i.test(props.source.path)) {
      const info =
        props.initialInfo ||
        (await http<PresentationInfo>(
          `${path}/presentation`,
          { signal: controller.signal },
          { ...query, checksum: props.source.checksum },
        ));
      if (disposed) return;
      if (info.checksum !== props.source.checksum)
        throw new Error("源文件已更新，请重新打开后编辑");
      settings.value = info.options;
      slides.value = info.slides;
      if (pdf.value) pdfSlideIds.value = info.slides.map((slide) => slide.id);
      checksum.value = info.checksum;
    } else
      settings.value = await http<PresentationOptions>(
        `${path}/presentation-options`,
        { signal: controller.signal },
      );
  } catch (reason) {
    if (!disposed)
      error.value =
        reason instanceof ApiError && reason.status === 404
          ? "暂时无法加载页面目录，请重试"
          : errorText(reason);
  } finally {
    if (!disposed) loading.value = false;
  }
}
onMounted(async () => {
  await loadDirectory();
  if (!pdf.value && settings.value) {
    refreshing.value = true;
    void refreshPreview(++previewGeneration);
  }
});
function directorySlides(count: number) {
  return slides.value.length === count
    ? slides.value
    : Array.from({ length: count }, (_, index) => ({
        id: `page-${index + 1}`,
        title: "",
      }));
}

/** 2. 每次操作立即保存真实 PPTX，再用新摘要刷新 PDF；预览失败时允许单独重试。 */
function cancelPreview() {
  ++previewGeneration;
  fullController?.abort();
  pageController?.abort();
}
async function readPreview(signal: AbortSignal, page?: number) {
  const response = await requestRaw(
    `${path}/preview`,
    { signal },
    { ...query, checksum: checksum.value, ...(page ? { page } : {}) },
  );
  return response.blob();
}
async function refreshPreview(generation: number) {
  fullController = new AbortController();
  const signal = fullController.signal,
    version = checksum.value;
  try {
    const blob = await readPreview(signal);
    if (
      disposed ||
      generation !== previewGeneration ||
      version !== checksum.value
    )
      return;
    pdf.value = blob;
    pdfSlideIds.value = slides.value.map((slide) => slide.id);
    renderedChecksum.value = version;
    pageController?.abort();
    previewFailed.value = false;
    error.value = "";
  } catch (reason) {
    if (!disposed && generation === previewGeneration && !signal.aborted) {
      previewFailed.value = true;
      error.value = `页面已保存，完整预览刷新失败：${errorText(reason)}`;
    }
  } finally {
    if (!disposed && generation === previewGeneration) refreshing.value = false;
  }
}
async function refreshNewPage(id: string, page: number, generation: number) {
  pageController = new AbortController();
  const signal = pageController.signal;
  try {
    const blob = await readPreview(signal, page);
    if (
      disposed ||
      generation !== previewGeneration ||
      renderedChecksum.value === checksum.value ||
      !pdf.value
    )
      return;
    const { buildPresentationPreview } = await import("./presentationPreview");
    const bytes = await buildPresentationPreview(
      new Uint8Array(await pdf.value.arrayBuffer()),
      pdfSlideIds.value,
      pdfSlideIds.value,
      { id, bytes: new Uint8Array(await blob.arrayBuffer()) },
    );
    if (
      !disposed &&
      generation === previewGeneration &&
      renderedChecksum.value !== checksum.value
    )
      pdf.value = new Blob([new Uint8Array(bytes)], {
        type: "application/pdf",
      });
  } catch {
    // 单页加速失败仍由完整预览校准；不把已成功保存的文件报告成失败。
  }
}
async function change(
  operation: SlideOperation,
  slideId = slides.value[current.value - 1]?.id,
  targetIndex?: number,
) {
  if (!editable.value || busy.value || !slideId) return;
  busy.value = true;
  error.value = "";
  cancelPreview();
  const generation = previewGeneration;
  try {
    const init = json("POST", {
      operation_type: operation,
      slide_id: slideId,
      ...(targetIndex ? { target_index: targetIndex } : {}),
    });
    const headers = new Headers(init.headers);
    headers.set("If-Match", `"${checksum.value}"`);
    const result = await http<{
      checksum: string;
      slides: PresentationSlide[];
      active_slide_id: string;
    }>(
      `${path}/presentation/slides`,
      { ...init, headers, signal: controller.signal },
      query,
    );
    if (disposed) return;
    checksum.value = result.checksum;
    emit("saved", checksum.value);
    slides.value = result.slides;
    initialPage.value = Math.max(
      1,
      result.slides.findIndex((slide) => slide.id === result.active_slide_id) +
        1,
    );
    current.value = initialPage.value;
    previewFailed.value = false;
    refreshing.value = true;
    if (!result.slides.some((slide) => slide.id === clipboard.value))
      clipboard.value = "";
    try {
      if (pdf.value) {
        const { buildPresentationPreview } =
          await import("./presentationPreview");
        const bytes = await buildPresentationPreview(
          new Uint8Array(await pdf.value.arrayBuffer()),
          pdfSlideIds.value,
          result.slides.map((slide) => slide.id),
          undefined,
          operation === "duplicate"
            ? { id: result.active_slide_id, sourceId: slideId }
            : undefined,
        );
        if (disposed) return;
        pdf.value = new Blob([new Uint8Array(bytes)], {
          type: "application/pdf",
        });
        pdfSlideIds.value = result.slides.map((slide) => slide.id);
      }
    } catch {
      // 保留旧预览，不因临时页序合成失败清空页面；完整版本仍会更新。
    }
    if (operation === "add")
      void refreshNewPage(
        result.active_slide_id,
        initialPage.value,
        generation,
      );
    void refreshPreview(generation);
  } catch (reason) {
    if (!disposed) {
      error.value = errorText(reason);
      refreshing.value = renderedChecksum.value !== checksum.value;
      if (refreshing.value) void refreshPreview(generation);
    }
  } finally {
    if (!disposed) busy.value = false;
  }
}
function retryPreview() {
  if (busy.value) return;
  cancelPreview();
  error.value = "";
  refreshing.value = true;
  void refreshPreview(previewGeneration);
}

function action(operation: string, index: number) {
  const slide = slides.value[index - 1];
  if (!slide || busy.value) return;
  if (operation === "copy") {
    clipboard.value = slide.id;
    return;
  }
  if (operation === "paste") {
    void change("duplicate", clipboard.value, index + 1);
    return;
  }
  if (operation === "remove") {
    void change("remove", slide.id);
    return;
  }
  if (operation === "move_up") void change("move", slide.id, index - 1);
  if (operation === "move_down") void change("move", slide.id, index + 1);
}

/** 3. 下载始终读取当前项目原件，防止页面编辑后下载到打开时的旧 Blob。 */
async function download() {
  try {
    const response = await requestRaw(
      `${path}/file`,
      { signal: controller.signal },
      query,
    );
    const blob = await response.blob();
    if (disposed) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = props.source.path.split("/").pop()!;
    link.click();
    URL.revokeObjectURL(url);
  } catch (reason) {
    if (!disposed) error.value = errorText(reason);
  }
}
onBeforeUnmount(() => {
  disposed = true;
  controller.abort();
  cancelPreview();
});
const canLeave = () => !busy.value;
onBeforeRouteLeave(canLeave);
onBeforeRouteUpdate(canLeave);
defineExpose({ canLeave, download });
</script>
<template>
  <section class="presentation-preview" aria-label="演示文稿">
    <div class="presentation-actions">
      <button
        :aria-label="directory ? '收起目录' : '展开目录'"
        :aria-expanded="directory"
        @click="directory = !directory"
      >
        <List :size="16" />目录
      </button>
      <button
        v-if="/\.pptx$/i.test(source.path)"
        :disabled="
          !editable ||
          busy ||
          !pdf ||
          (!!settings && slides.length >= settings.maxSlides)
        "
        @click="change('add')"
      >
        <Plus :size="15" />新建幻灯片
      </button>
      <span role="status">{{
        busy
          ? "正在保存页面…"
          : loading
            ? "正在读取目录…"
            : refreshing
              ? "已保存 · 预览更新中，可继续操作"
              : ""
      }}</span>
      <button :disabled="busy" @click="download" aria-label="下载演示文稿">
        <Download :size="16" />
      </button>
    </div>
    <div v-if="error" class="presentation-error" role="alert">
      {{ error
      }}<button v-if="previewFailed" :disabled="busy" @click="retryPreview">
        重新加载预览
      </button>
      <button v-else-if="!settings" :disabled="loading" @click="loadDirectory">
        重新加载目录
      </button>
    </div>
    <PdfPreview
      v-if="pdf"
      :blob="pdf"
      :source="readySource"
      :options="options"
      :anchor="locatedAnchor"
      :initial-page="initialPage"
      :interaction-disabled="busy || refreshing || previewFailed"
      continuous
      @page-change="(value) => (current = value)"
      @reference="(value, accept) => emit('reference', value, accept)"
    >
      <template #directory="{ document, count, page, selectPage }">
        <PresentationDirectory
          v-if="directory && document && settings"
          :document="document"
          :slides="directorySlides(count)"
          :page="page"
          :options="settings"
          :editable="editable && slides.length === count"
          :busy="busy"
          :can-paste="!!clipboard"
          @select="selectPage"
          @action="action"
        />
      </template>
    </PdfPreview>
    <div v-else class="presentation-refresh" role="status">
      {{
        refreshing ? "正在生成页面预览，生成后会自动显示…" : "请重新加载预览。"
      }}
    </div>
  </section>
</template>
<style scoped>
.presentation-preview {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
.presentation-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--line);
  color: var(--text);
  background: var(--surface);
  font-size: 11px;
  flex: none;
  flex-wrap: wrap;
}
.presentation-actions button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 6px 8px;
  background: var(--bg);
  color: var(--text);
  font-size: 11px;
  cursor: pointer;
}
.presentation-actions button:disabled {
  opacity: 0.4;
  cursor: default;
}
.presentation-actions span {
  flex: 1;
  color: var(--muted);
}
.presentation-error {
  padding: 10px 12px;
  background: var(--hover);
  color: var(--error, #c43b32);
  font-size: 12px;
}
.presentation-error button {
  margin-left: 8px;
}
.presentation-refresh {
  display: grid;
  place-items: center;
  flex: 1;
  padding: 24px;
  color: var(--muted);
  font-size: 12px;
}
</style>
