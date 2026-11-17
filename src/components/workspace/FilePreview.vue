<script setup lang="ts">
import { ref, watch, onUnmounted, computed, defineAsyncComponent } from "vue";
import { requestRaw, errorText, ApiError } from "../../api/http";
import { workspacePath } from "../../api/manager";
import PreviewSelection from "./PreviewSelection.vue";
import HtmlPreview from "./HtmlPreview.vue";
import {
  isPreviewImage,
  type PreviewAnchor,
  type PreviewOptions,
  type PreviewAcceptance,
  type PreviewReference,
} from "../../domain/previewReferences";
import { http } from "../../api/http";
import { checkOfficeArchive } from "./officeArchive";
import type { PresentationInfo } from "../../domain/presentation";
import MarkdownContent from "../conversation/MarkdownContent.vue";
const SpreadsheetPreview = defineAsyncComponent({
  loader: () => import("./SpreadsheetPreview.vue"),
  onError(_reason, _retry, fail) {
    error.value = "无法加载 Excel 编辑器，请刷新页面后重试";
    fail();
  },
});
const spreadsheet = ref<InstanceType<typeof SpreadsheetPreview>>();
const PresentationPreview = defineAsyncComponent(
  () => import("./PresentationPreview.vue"),
);
const presentation = ref<InstanceType<typeof PresentationPreview>>();
const workbookBlob = ref<Blob | null>(null);
function canLeave() {
  return (
    (spreadsheet.value?.canLeave() ?? true) &&
    (presentation.value?.canLeave() ?? true)
  );
}
function download() {
  if (presentation.value) {
    void presentation.value.download();
    return;
  }
  if (!url.value) return;
  const link = document.createElement("a");
  link.href = url.value;
  link.download = props.path.split("/").pop()!;
  link.click();
}
const refreshRevision = ref(0);
function hasPendingChanges() {
  return (
    (spreadsheet.value?.hasPendingChanges() ?? false) ||
    !(presentation.value?.canLeave() ?? true)
  );
}
defineExpose({
  canLeave,
  download,
  hasPendingChanges,
  refresh: () => refreshRevision.value++,
});
const PdfPreview = defineAsyncComponent(() => import("./PdfPreview.vue"));
const pdfBlob = ref<Blob | null>(null);
const presentationInfo = ref<PresentationInfo>();
const isTextFile = (path: string, mime: string) =>
  mime.startsWith("text/") ||
  /\.(txt|md|markdown|json|csv|log|py|ts|js|yaml|yml|c|cpp|h|cs|java|go|rs|sh|sql|xml|toml|ini|vue|tsx|jsx|rb|php|swift|kt|scala|properties|conf)$/i.test(
    path,
  );
const props = defineProps<{
  projectId: string;
  area: string;
  path: string;
  anchor?: PreviewAnchor;
}>();
const emit = defineEmits<{
  reference: [value: PreviewReference, accept: PreviewAcceptance];
  saved: [];
}>();
const checksum = ref(""),
  options = ref<PreviewOptions>(),
  optionsError = ref("");
const source = computed(() =>
  checksum.value
    ? {
        projectId: props.projectId,
        area: props.area as PreviewAnchor["area"],
        path: props.path,
        checksum: checksum.value,
      }
    : undefined,
);
const isImage = computed(() => isPreviewImage(props.path, mime.value));
const isPresentation = computed(() => /\.pptx?$/i.test(props.path));
const supportedReference = computed(() => !/\.(xlsx?|ods)$/i.test(props.path));
const locatedAnchor = computed(() =>
  props.anchor?.checksum === checksum.value ? props.anchor : undefined,
);
const loading = ref(false),
  error = ref(""),
  text = ref(""),
  url = ref(""),
  mime = ref(""),
  officeHtml = ref(""),
  officeError = ref("");
let controller: AbortController | null = null;
function clearContent() {
  if (url.value) URL.revokeObjectURL(url.value);
  url.value = "";
  checksum.value = "";
  options.value = undefined;
  optionsError.value = "";
  text.value = "";
  pdfBlob.value = null;
  presentationInfo.value = undefined;
  officeHtml.value = "";
  workbookBlob.value = null;
  officeError.value = "";
}
function reset() {
  controller?.abort();
  clearContent();
}
const fileIdentity = computed(() =>
  JSON.stringify([props.projectId, props.area, props.path]),
);
watch(
  [fileIdentity, refreshRevision],
  async ([identity], previous) => {
    const sameFile = identity === previous?.[0];
    // 自动刷新不能覆盖正在编辑的工作簿或演示文稿。
    if (sameFile && hasPendingChanges()) return;
    const keepContent =
      sameFile &&
      !loading.value &&
      !error.value &&
      !optionsError.value &&
      !!checksum.value;
    controller?.abort();
    if (!sameFile) clearContent();
    if (!props.path) return;
    controller = new AbortController();
    const signal = controller.signal;
    loading.value = !keepContent;
    error.value = "";
    try {
      const path = workspacePath(props.projectId);
      const query = { area: props.area, path: props.path };
      if (/\.pptx$/i.test(props.path)) {
        const [info, limits] = await Promise.all([
          http<PresentationInfo>(
            `${path}/presentation`,
            { signal, cache: "no-store" },
            query,
          ),
          http<PreviewOptions>(`${path}/preview-options`, { signal }),
        ]);
        if (signal.aborted) return;
        if (
          (sameFile && hasPendingChanges()) ||
          (keepContent && info.checksum === checksum.value)
        )
          return;
        clearContent();
        checksum.value = info.checksum;
        presentationInfo.value = info;
        options.value = limits;
        return;
      }
      const response = await requestRaw(
        `${path}/file`,
        { signal, cache: "no-store" },
        query,
      );
      const blob = await response.blob();
      const digest = await crypto.subtle.digest(
        "SHA-256",
        await blob.arrayBuffer(),
      );
      if (signal.aborted) return;
      const nextChecksum = Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
      // 内容相同则保留实例、滚动位置及框选；下载期间开始编辑也必须保留草稿。
      if (
        (sameFile && hasPendingChanges()) ||
        (keepContent && nextChecksum === checksum.value)
      )
        return;
      clearContent();
      loading.value = true;
      checksum.value = nextChecksum;
      mime.value = blob.type.split(";")[0] || "";
      // SVG 即使由通用文件接口返回 text/plain，也始终在图片上下文渲染。
      const previewBlob = /\.svg$/i.test(props.path)
        ? new Blob([blob], { type: "image/svg+xml" })
        : blob;
      url.value = URL.createObjectURL(previewBlob);
      const limits = http<PreviewOptions>(`${path}/preview-options`, { signal })
        .then((value) => {
          if (!signal.aborted) options.value = value;
        })
        .catch(() => {
          if (!signal.aborted)
            optionsError.value = "无法读取框选配置，请重新打开文件";
        });
      await limits;
      if (signal.aborted) return;
      if (mime.value === "application/pdf" || /\.pdf$/i.test(props.path))
        pdfBlob.value = blob;
      if (/\.(pptx?|doc|xls|odt|ods|odp)$/i.test(props.path)) {
        const converted = await requestRaw(
          `${path}/preview`,
          { signal },
          { ...query, checksum: checksum.value },
        );
        const convertedBlob = await converted.blob();
        if (!signal.aborted) pdfBlob.value = convertedBlob;
      }

      if (/\.xlsx$/i.test(props.path)) workbookBlob.value = blob;
      if (/\.docx$/i.test(props.path)) {
        if (blob.size > 10 * 1024 * 1024) {
          officeError.value = "文件超过 10 MB，请下载后查看。";
          return;
        }
        try {
          const buffer = await blob.arrayBuffer();
          checkOfficeArchive(buffer);
          if (/\.docx$/i.test(props.path)) {
            const mammoth = await import("mammoth");
            const converted = await mammoth.convertToHtml({
              arrayBuffer: buffer,
            });
            const DOMPurify = (await import("dompurify")).default;
            if (!signal.aborted)
              officeHtml.value = DOMPurify.sanitize(converted.value, {
                FORBID_TAGS: ["style", "iframe", "form"],
                FORBID_ATTR: ["style", "src", "href"],
              });
          }
        } catch {
          if (!signal.aborted)
            officeError.value = "无法预览此文件，请下载后查看。";
        }
      }
      if (
        !isPreviewImage(props.path, mime.value) &&
        isTextFile(props.path, mime.value)
      ) {
        const content = await blob.slice(0, 1024 * 1024).text();
        if (!signal.aborted) text.value = content;
      }
    } catch (e) {
      if (!signal.aborted)
        error.value =
          /\.pptx$/i.test(props.path) &&
          e instanceof ApiError &&
          e.status === 404
            ? "暂时无法加载页面目录，请重试"
            : errorText(e);
    } finally {
      if (!signal.aborted) loading.value = false;
    }
  },
  { immediate: true },
);
onUnmounted(reset);
</script>
<template>
  <section class="file-preview">
    <div v-if="loading" class="empty"><t-loading text="正在读取文件" /></div>
    <div v-else-if="error" class="error" role="alert">
      {{ error
      }}<button @click="refreshRevision++">
        {{ /\.pptx$/i.test(path) ? "重新加载目录" : "重新加载文件" }}
      </button>
    </div>
    <template v-else-if="url || presentationInfo">
      <p v-if="optionsError" class="error" role="alert">{{ optionsError }}</p>
      <p
        v-if="anchor && checksum && anchor.checksum !== checksum"
        class="error"
        role="alert"
      >
        源文件已更新，以下显示最新内容；历史截图保留原始引用，原标注未套用到新文件。
      </p>
      <SpreadsheetPreview
        v-if="workbookBlob && source && options"
        ref="spreadsheet"
        :blob="workbookBlob"
        :source="source"
        :options="options"
        :anchor="locatedAnchor"
        @reference="(value, accept) => emit('reference', value, accept)"
        @saved="
          (value) => {
            checksum = value;
            emit('saved');
          }
        "
      />
      <PresentationPreview
        v-else-if="
          isPresentation && source && options && (pdfBlob || presentationInfo)
        "
        :key="presentationInfo?.checksum"
        ref="presentation"
        :blob="pdfBlob"
        :initial-info="presentationInfo"
        :source="source"
        :options="options"
        :anchor="locatedAnchor"
        @reference="(value, accept) => emit('reference', value, accept)"
        @saved="
          (value) => {
            checksum = value;
            emit('saved');
          }
        "
      />
      <PdfPreview
        v-else-if="pdfBlob"
        :blob="pdfBlob"
        :source="supportedReference ? source : undefined"
        :options="options"
        :anchor="locatedAnchor"
        @reference="(value, accept) => emit('reference', value, accept)"
      />
      <HtmlPreview
        v-else-if="mime === 'text/html' || /\.html?$/i.test(path)"
        :content="text"
        :source="source"
        :options="options"
        :anchor="locatedAnchor"
        @reference="(value, accept) => emit('reference', value, accept)"
      />
      <PreviewSelection
        v-else
        :source="
          supportedReference && (isImage || text || officeHtml)
            ? source
            : undefined
        "
        :options="options"
        :anchor="locatedAnchor"
        @reference="(value, accept) => emit('reference', value, accept)"
      >
        <img v-if="isImage" :src="url" :alt="path" class="preview-image" />
        <div v-else-if="officeError" class="empty">
          <p>{{ officeError }}</p>
          <a :href="url" :download="path.split('/').pop()">下载文件</a>
        </div>
        <div
          v-else-if="/\.docx$/i.test(path)"
          class="office-document"
          v-html="officeHtml"
        ></div>
        <MarkdownContent
          v-else-if="/\.(md|markdown)$/i.test(path)"
          :text="text"
          class="markdown-preview"
        />
        <pre v-else-if="isTextFile(path, mime)" class="text-preview">{{
          text
        }}</pre>
        <div v-else class="empty">
          <h3>此文件适合下载后查看</h3>
          <a :href="url" :download="path.split('/').pop()"
            ><t-button variant="outline">下载文件</t-button></a
          >
        </div></PreviewSelection
      ></template
    >
  </section>
</template>
<style scoped src="./FilePreview.css"></style>
