<script setup lang="ts">
import { ref, watch, onUnmounted, computed, defineAsyncComponent } from "vue";
import { requestRaw, errorText } from "../../api/http";
import { workspacePath } from "../../api/manager";
import { checkOfficeArchive } from "./officeArchive";
import MarkdownContent from "../conversation/MarkdownContent.vue";
import AppIcon from "../common/AppIcon.vue";
import FileTypeIcon from "../common/FileTypeIcon.vue";
const PdfPreview = defineAsyncComponent(() => import("./PdfPreview.vue"));
const pdfBlob = ref<Blob | null>(null);
const isTextFile = (path: string, mime: string) =>
  mime.startsWith("text/") ||
  /\.(txt|md|markdown|json|csv|log|py|ts|js|yaml|yml|c|cpp|h|cs|java|go|rs|sh|sql|xml|toml|ini|vue|tsx|jsx|rb|php|swift|kt|scala|properties|conf)$/i.test(
    path,
  );
const props = defineProps<{
  projectId: string;
  area: string;
  path: string;
}>();
const loading = ref(false),
  error = ref(""),
  text = ref(""),
  url = ref(""),
  mime = ref(""),
  officeHtml = ref(""),
  sheets = ref<{ name: string; rows: string[][] }[]>([]),
  sheetIndex = ref(0),
  officeError = ref("");
const safeHtml = computed(
  () =>
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'">${text.value}`,
);
let controller: AbortController | null = null;
function reset() {
  controller?.abort();
  if (url.value) URL.revokeObjectURL(url.value);
  url.value = "";
  text.value = "";
  pdfBlob.value = null;
  officeHtml.value = "";
  sheets.value = [];
  sheetIndex.value = 0;
  officeError.value = "";
}
watch(
  () => [props.projectId, props.area, props.path],
  async () => {
    reset();
    if (!props.path) return;
    controller = new AbortController();
    const signal = controller.signal;
    loading.value = true;
    error.value = "";
    try {
      const path = workspacePath(props.projectId);
      const query = { area: props.area, path: props.path };
      const response = await requestRaw(`${path}/file`, { signal }, query);
      const blob = await response.blob();
      if (signal.aborted) return;
      mime.value = blob.type.split(";")[0];
      url.value = URL.createObjectURL(blob);
      if (mime.value === "application/pdf" || /\.pdf$/i.test(props.path))
        pdfBlob.value = blob;
      if (/\.(pptx?|doc|xls|odt|ods|odp)$/i.test(props.path)) {
        const converted = await requestRaw(`${path}/preview`, { signal }, query);
        const convertedBlob = await converted.blob();
        if (!signal.aborted) pdfBlob.value = convertedBlob;
      }

      if (/\.(docx|xlsx)$/i.test(props.path)) {
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
          } else {
            const readXlsxFile = (await import("read-excel-file/browser"))
              .default;
            const workbook = await readXlsxFile(blob);
            if (!signal.aborted)
              sheets.value = workbook.slice(0, 20).map((sheet) => ({
                name: sheet.sheet,
                rows: sheet.data
                  .slice(0, 200)
                  .map((row) =>
                    row
                      .slice(0, 30)
                      .map((cell) => (cell == null ? "" : String(cell))),
                  ),
              }));
          }
        } catch {
          if (!signal.aborted)
            officeError.value = "无法预览此文件，请下载后查看。";
        }
      }
      if (isTextFile(props.path, mime.value)) {
        const content = await blob.slice(0, 1024 * 1024).text();
        if (!signal.aborted) text.value = content;
      }
    } catch (e) {
      if (!signal.aborted) error.value = errorText(e);
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
    <header>
      <FileTypeIcon :name="path" :size="24" />
      <span class="preview-file-name">{{ path.split("/").pop() }}</span
      ><a
        v-if="url"
        :href="url"
        :download="path.split('/').pop()"
        class="plain download"
        title="下载文件"
        ><AppIcon name="download" :size="16"
      /></a>
    </header>
    <div v-if="loading" class="empty"><t-loading text="正在读取文件" /></div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else-if="url"
      ><iframe
        v-if="mime === 'text/html' || /\.html?$/i.test(path)"
        :srcdoc="safeHtml"
        sandbox=""
        referrerpolicy="no-referrer"
        title="隔离的 HTML 预览"
        class="html-preview"
      ></iframe>
      <div v-else-if="officeError" class="empty">
        <p>{{ officeError }}</p>
        <a :href="url" :download="path.split('/').pop()">下载文件</a>
      </div>
      <div
        v-else-if="/\.docx$/i.test(path)"
        class="office-document"
        v-html="officeHtml"
      ></div>
      <div v-else-if="/\.xlsx$/i.test(path)" class="sheet-preview">
        <p>最多显示 20 个工作表、每表前 200 行和 30 列。</p>
        <select
          v-if="sheets.length"
          v-model="sheetIndex"
          aria-label="选择工作表"
        >
          <option v-for="(sheet, index) in sheets" :key="index" :value="index">
            {{ sheet.name }}
          </option>
        </select>
        <table v-if="sheets[sheetIndex]">
          <tbody>
            <tr v-for="(row, i) in sheets[sheetIndex].rows" :key="i">
              <td v-for="(cell, j) in row" :key="j">{{ cell }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else>工作簿没有可显示的工作表。</p>
      </div>
      <MarkdownContent
        v-else-if="/\.(md|markdown)$/i.test(path)"
        :text="text"
        class="markdown-preview"
      />
      <pre v-else-if="isTextFile(path, mime)" class="text-preview">{{
        text
      }}</pre>
      <img
        v-else-if="
          ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mime)
        "
        :src="url"
        :alt="path"
      /><PdfPreview v-else-if="pdfBlob" :blob="pdfBlob" />
      <div v-else class="empty">
        <h3>此文件适合下载后查看</h3>
        <a :href="url" :download="path.split('/').pop()"
          ><t-button variant="outline">下载文件</t-button></a
        >
      </div></template
    >
  </section>
</template>
<style scoped src="./FilePreview.css"></style>
