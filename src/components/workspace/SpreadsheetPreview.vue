<script setup lang="ts">
/** 项目 Excel 编辑器：原生 Designer、摘要保存、单元格引用和历史定位。 */
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import { onBeforeRouteLeave, onBeforeRouteUpdate } from "vue-router";
import GC from "@mescius/spread-sheets";
import "@mescius/spread-sheets-io";
import "@mescius/spread-sheets-print";
import "@mescius/spread-sheets-resources-zh";
import "@mescius/spread-sheets-languagepackages";
import "@mescius/spread-sheets-designer-resources-cn";
import DesignerGC from "@mescius/spread-sheets-designer";
import "@mescius/spread-sheets/styles/gc.spread.sheets.excel2013white.css";
import "@mescius/spread-sheets-designer/styles/gc.spread.sheets.designer.min.css";
import DOMPurify from "dompurify";
import { unzipSync, strFromU8 } from "fflate";
import { http, requestRaw, errorText } from "../../api/http";
import { workspacePath } from "../../api/manager";
import {
  normalizeCellRange,
  cellRangeAddress,
} from "../../domain/spreadsheetReference";
import type {
  PreviewAnchor,
  PreviewOptions,
  PreviewReference,
  PreviewAcceptance,
} from "../../domain/previewReferences";
import { capturePreview } from "./previewCapture";
import { checkOfficeArchive, type OfficeArchiveLimits } from "./officeArchive";

const props = defineProps<{
  blob: Blob;
  source: Pick<PreviewAnchor, "projectId" | "area" | "path" | "checksum">;
  options: PreviewOptions;
  anchor?: PreviewAnchor;
}>();
const emit = defineEmits<{
  reference: [value: PreviewReference, accept: PreviewAcceptance];
  saved: [checksum: string];
}>();
const host = ref<HTMLDivElement>(),
  root = ref<HTMLElement>();
const loading = ref(true),
  saving = ref(false),
  quoting = ref(false),
  dirty = ref(false),
  expanded = ref(false);
const error = ref(""),
  status = ref(""),
  selectionLabel = ref("");
const sheetNames = ref<string[]>([]),
  activeSheet = ref("");
let designer: DesignerGC.Spread.Sheets.Designer.Designer | undefined;
let spread: GC.Spread.Sheets.Workbook | undefined;
let checksum = props.source.checksum;
let workbookOptions: OfficeArchiveLimits & { maxReferenceCells: number };
let observer: ResizeObserver | undefined;
let selectionFrame = 0;
let disposed = false,
  changeSequence = 0;
const controller = new AbortController();

/** 1. 初始化官方组件；项目文件保存由本页面处理，公式及编辑命令保持原生。 */
onMounted(async () => {
  try {
    workbookOptions = await http(
      `${workspacePath(props.source.projectId)}/workbook-options`,
      { signal: controller.signal },
    );
    if (disposed) return;
    if (props.blob.size > workbookOptions.maxBytes)
      throw new Error("文件超过工作簿编辑大小限制，请下载后打开");
    const sourceBuffer = await props.blob.arrayBuffer();
    checkOfficeArchive(sourceBuffer, workbookOptions);
    if (disposed) return;
    GC.Spread.Common.CultureManager.culture("zh-cn");
    const config = {
      ...DesignerGC.Spread.Sheets.Designer.DefaultConfig,
      fileMenu: "",
      quickAccessBar: [],
    };
    // 未购买的附加产品不接入；保留表格和 Designer 的原生命令。
    if (Array.isArray(config.ribbon))
      config.ribbon = config.ribbon.filter(
        (tab) =>
          !["pageLayout", "reportSheet", "pivotTable", "tableSheet"].includes(
            tab.id,
          ),
      );
    designer = new DesignerGC.Spread.Sheets.Designer.Designer(
      host.value!,
      config,
    );
    spread = designer.getWorkbook() as GC.Spread.Sheets.Workbook;
    spread.options.allowContextMenu = true;
    spread.options.allowUserEditFormula = true;
    // 不注册任何远程数据源/外部公式处理器，项目内容只走本应用 API。
    await new Promise<void>((resolve, reject) =>
      spread!.import(
        new File([props.blob], props.source.path.split("/").pop()!),
        resolve,
        reject,
        {
          fileType: GC.Spread.Sheets.FileType.excel,
          fullRecalc: true,
        },
      ),
    );
    if (disposed) return;
    // 恢复文件自身记录的活动工作表；不修改组件的试用提示及试用工作表。
    const parts = unzipSync(new Uint8Array(sourceBuffer), {
      filter: (entry) =>
        entry.name === "xl/workbook.xml" &&
        entry.originalSize <= workbookOptions.maxBytes,
    });
    const workbookXml = parts["xl/workbook.xml"];
    if (workbookXml) {
      const document = new DOMParser().parseFromString(
        strFromU8(workbookXml),
        "application/xml",
      );
      const sheets = Array.from(document.getElementsByTagName("sheet"));
      const activeTab = Number(
        document
          .getElementsByTagName("workbookView")[0]
          ?.getAttribute("activeTab") || 0,
      );
      const activeName = sheets[activeTab]?.getAttribute("name");
      if (activeName && spread.getSheetFromName(activeName))
        spread.setActiveSheet(activeName);
    }
    const events = GC.Spread.Sheets.Events;
    for (const name of [
      events.CellChanged,
      events.RangeChanged,
      events.RowChanged,
      events.ColumnChanged,
      events.SheetChanged,
      events.CommentChanged,
      events.CommentRemoved,
      events.SheetNameChanged,
      events.SheetMoved,
      events.ColumnWidthChanged,
      events.RowHeightChanged,
      events.FloatingObjectChanged,
      events.FloatingObjectRemoved,
      events.PictureChanged,
      events.ShapeChanged,
      events.ShapeRemoved,
      events.TableColumnsChanged,
      events.TableRowsChanged,
      events.TableResized,
      events.TableFiltered,
      events.TableFilterCleared,
    ])
      spread.bind(name, markChanged);
    spread.bind(events.SelectionChanged, scheduleSelection);
    spread.bind(events.ActiveSheetChanged, scheduleSelection);
    spread.bind(events.EnterCell, scheduleSelection);
    const nativeOpen = spread.contextMenu.onOpenMenu;
    spread.contextMenu.onOpenMenu = function (all, shown, hit, workbook) {
      const handled = nativeOpen?.call(this, all, shown, hit, workbook);
      if (!handled)
        shown.unshift({
          name: "agentkit-reference",
          text: "加入对话",
          command: () => {
            void quoteSelection();
          },
        });
      return !!handled;
    };
    observer = new ResizeObserver(() => {
      designer?.refresh();
      spread?.refresh();
    });
    observer.observe(root.value!);
    loading.value = false;
    locateAnchor();
    updateSelection();
  } catch (reason) {
    if (!disposed) {
      error.value = `无法打开 Excel：${errorText(reason)}`;
      loading.value = false;
    }
  }
});

function markChanged() {
  if (!loading.value) {
    scheduleSelection();
    dirty.value = true;
    changeSequence++;
    status.value = "";
  }
}
function scheduleSelection() {
  // 名称框命令与原生选择事件在状态提交前派发；在下一帧读取最终选区。
  cancelAnimationFrame(selectionFrame);
  selectionFrame = requestAnimationFrame(() => {
    if (!disposed) updateSelection();
  });
}
function updateSelection() {
  const sheet = spread?.getActiveSheet();
  if (!sheet) return;
  const range = sheet.getSelections()[0] || {
    row: 0,
    col: 0,
    rowCount: 1,
    colCount: 1,
  };
  sheetNames.value = Array.from({ length: spread!.getSheetCount() }, (_, i) =>
    spread!.getSheet(i).name(),
  );
  activeSheet.value = sheet.name();
  try {
    selectionLabel.value = `${sheet.name()} · ${cellRangeAddress(normalizeCellRange(range, sheet.getRowCount(), sheet.getColumnCount(), workbookOptions.maxReferenceCells))}`;
  } catch {
    selectionLabel.value = `${sheet.name()} · 选区过大`;
  }
}
function selectSheet() {
  spread?.setActiveSheet(activeSheet.value);
  updateSelection();
}

/** 2. 保存前结束单元格编辑，导出 XLSX；冲突时保留用户正在编辑的内容。 */
async function exportWorkbook() {
  if (!spread || !spread.getActiveSheet().endEdit())
    throw new Error("请先完成当前单元格编辑");
  return new Promise<Blob>((resolve, reject) =>
    spread!.export(resolve, reject, {
      fileType: GC.Spread.Sheets.FileType.excel,
      includeStyles: true,
      includeFormulas: true,
      losslessEditing: true,
    }),
  );
}
async function save() {
  if (loading.value || saving.value || !spread) return;
  saving.value = true;
  error.value = "";
  try {
    const content = await exportWorkbook(),
      sequence = changeSequence;
    const response = await requestRaw(
      `${workspacePath(props.source.projectId)}/file`,
      {
        method: "PUT",
        body: content,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "If-Match": `"${checksum}"`,
        },
        signal: controller.signal,
      },
      { area: props.source.area, path: props.source.path },
    );
    const saved = await response.json();
    checksum = saved.checksum;
    dirty.value = changeSequence !== sequence;
    status.value = dirty.value ? "已保存，仍有新修改" : "已保存到项目";
    emit("saved", checksum);
  } catch (reason) {
    if (!disposed) error.value = errorText(reason);
  } finally {
    saving.value = false;
  }
}
async function download() {
  try {
    const blob = await exportWorkbook(),
      url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = props.source.path.split("/").pop()!;
    link.click();
    URL.revokeObjectURL(url);
  } catch (reason) {
    error.value = errorText(reason);
  }
}

/** 3. 原生选区生成独立引用截图；工作表名、范围、显示值和公式一起进入消息。 */
async function quoteSelection() {
  if (!spread || quoting.value || loading.value) return;
  quoting.value = true;
  error.value = "";
  const stage = document.createElement("div");
  const offscreen = document.createElement("div");
  offscreen.style.cssText =
    "position:fixed;left:-100000px;top:0;width:max-content";
  try {
    if (dirty.value) {
      await save();
      if (dirty.value || error.value)
        throw new Error(error.value || "请先保存工作簿再引用");
    }
    const sheet = spread.getActiveSheet();
    const ranges = sheet
      .getSelections()
      .map((r) =>
        normalizeCellRange(
          r,
          sheet.getRowCount(),
          sheet.getColumnCount(),
          workbookOptions.maxReferenceCells,
        ),
      );
    if (
      !ranges.length ||
      ranges.reduce((n, r) => n + r.rowCount * r.colCount, 0) >
        workbookOptions.maxReferenceCells
    )
      throw new Error(
        `选区最多引用 ${workbookOptions.maxReferenceCells} 个单元格`,
      );
    const excerpt: string[] = [];
    stage.className = "spreadsheet-capture";
    stage.style.cssText =
      "width:max-content;background:white;color:black;padding:12px;font:14px sans-serif";
    for (const range of ranges) {
      const title = document.createElement("div");
      title.textContent = `${sheet.name()} · ${cellRangeAddress(range)}`;
      stage.append(title);
      const table = document.createElement("div");
      table.innerHTML = DOMPurify.sanitize(
        sheet
          .getRange(range.row, range.col, range.rowCount, range.colCount)
          .toHtml(GC.Spread.Sheets.HeaderOptions.allHeaders),
        {
          FORBID_TAGS: ["script", "iframe", "img", "object", "link", "style"],
          FORBID_ATTR: ["src", "href", "srcset"],
        },
      );
      stage.append(table);
      for (let row = range.row; row < range.row + range.rowCount; row++)
        for (let col = range.col; col < range.col + range.colCount; col++) {
          const formula = sheet.getFormula(row, col),
            value = sheet.getText(row, col);
          if (value || formula)
            excerpt.push(
              `${cellRangeAddress({ row, col, rowCount: 1, colCount: 1 })}=${value}${formula ? `（公式：${formula}）` : ""}`,
            );
        }
    }
    // 仅外层离屏定位；截图根节点保持正常文档流，避免 foreignObject 把内容画到画布外。
    offscreen.append(stage);
    document.body.append(offscreen);
    const captured = await capturePreview(stage, [], props.options);
    if (disposed) return;
    emit(
      "reference",
      {
        ...props.source,
        checksum,
        ...captured,
        id: crypto.randomUUID(),
        page: spread.getActiveSheetIndex() + 1,
        pageCount: spread.getSheetCount(),
        regions: [],
        spreadsheet: { sheetName: sheet.name(), ranges },
        excerpt: excerpt.join("\n").slice(0, props.options.maxExcerptChars),
      },
      () => {},
    );
  } catch (reason) {
    if (!disposed) error.value = errorText(reason);
  } finally {
    offscreen.remove();
    quoting.value = false;
  }
}

/** 4. 历史引用恢复原生选区；未保存离开前提醒，关闭时释放原生组件。 */
function locateAnchor() {
  const anchor = props.anchor?.spreadsheet;
  if (
    !spread ||
    loading.value ||
    !anchor ||
    props.anchor?.checksum !== checksum
  )
    return;
  const sheet = spread.getSheetFromName(anchor.sheetName);
  if (!sheet) {
    error.value = "引用的工作表已不存在";
    return;
  }
  spread.setActiveSheet(anchor.sheetName);
  sheet.clearSelection();
  for (const range of anchor.ranges)
    sheet.addSelection(range.row, range.col, range.rowCount, range.colCount);
  const first = anchor.ranges[0];
  if (first)
    sheet.showCell(
      first.row,
      first.col,
      GC.Spread.Sheets.VerticalPosition.center,
      GC.Spread.Sheets.HorizontalPosition.center,
    );
  updateSelection();
}
watch(() => props.anchor, locateAnchor);
function canLeave() {
  return (
    !saving.value &&
    (!dirty.value || window.confirm("工作簿还有未保存的修改，确认放弃并离开？"))
  );
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value || saving.value) {
    event.preventDefault();
    event.returnValue = "";
  }
}
function shortcut(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    event.stopPropagation();
    void save();
  }
}
onBeforeRouteLeave(canLeave);
onBeforeRouteUpdate(canLeave);
onMounted(() => {
  window.addEventListener("beforeunload", beforeUnload);
  root.value?.addEventListener("keydown", shortcut, true);
  root.value?.addEventListener("keyup", scheduleSelection, true);
  root.value?.addEventListener("pointerup", scheduleSelection, true);
});
onBeforeUnmount(() => {
  disposed = true;
  controller.abort();
  observer?.disconnect();
  cancelAnimationFrame(selectionFrame);
  window.removeEventListener("beforeunload", beforeUnload);
  root.value?.removeEventListener("keydown", shortcut, true);
  root.value?.removeEventListener("keyup", scheduleSelection, true);
  root.value?.removeEventListener("pointerup", scheduleSelection, true);
  designer?.destroy();
});
defineExpose({ canLeave, hasPendingChanges: () => dirty.value || saving.value });
</script>

<template>
  <section
    ref="root"
    class="spreadsheet-preview"
    :class="{ 'is-expanded': expanded }"
    aria-label="Excel 编辑器"
  >
    <div class="spreadsheet-actions">
      <select
        v-model="activeSheet"
        aria-label="选择工作表"
        :disabled="loading"
        @change="selectSheet"
      >
        <option v-for="name in sheetNames" :key="name" :value="name">
          {{ name }}
        </option>
      </select>
      <span class="spreadsheet-selection">{{
        loading ? "正在打开 Excel…" : selectionLabel
      }}</span>
      <span class="spreadsheet-save-state" role="status">{{
        dirty ? "未保存" : status
      }}</span>
      <button
        type="button"
        :disabled="loading || saving || quoting"
        @click="quoteSelection"
      >
        {{ quoting ? "引用中…" : "加入对话" }}
      </button>
      <button type="button" :disabled="loading || saving" @click="save">
        {{ saving ? "保存中…" : "保存" }}
      </button>
      <button type="button" :disabled="loading" @click="download">下载</button>
      <button type="button" @click="expanded = !expanded">
        {{ expanded ? "退出宽屏" : "宽屏编辑" }}
      </button>
    </div>
    <p v-if="error" role="alert" class="spreadsheet-error">{{ error }}</p>
    <div ref="host" class="spreadsheet-native" :inert="saving || quoting" />
  </section>
</template>

<style scoped>
.spreadsheet-preview {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 560px;
  background: #fff;
  color: #242424;
  position: relative;
}
.spreadsheet-preview.is-expanded {
  position: fixed;
  inset: 24px;
  z-index: 1200;
  box-shadow: 0 16px 80px #0006;
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
}
.spreadsheet-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid #e6e6e6;
  flex-wrap: wrap;
  font-size: 12px;
}
.spreadsheet-selection {
  flex: 1;
  min-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.spreadsheet-save-state {
  color: #727272;
}
.spreadsheet-actions button {
  padding: 6px 10px;
  color: #242424;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
}
.spreadsheet-actions button:disabled {
  opacity: 0.45;
  cursor: default;
}
.spreadsheet-native {
  flex: 1;
  min-height: 500px;
  width: 100%;
  overflow: hidden;
  color-scheme: light;
}
.spreadsheet-error {
  margin: 0;
  padding: 8px 12px;
  color: #b42318;
  background: #fff1f0;
  font-size: 12px;
}
</style>
