<script setup lang="ts">
import { computed, ref, watch, onUnmounted, nextTick } from "vue";
import type { Msg } from "@agentscope-ai/agentscope/message";
import { manager } from "../../api/manager";
import { workspace, type FileChange } from "../../api/workspace";
import {
  PanelRightClose,
  RotateCw,
  Plus,
  Maximize2,
  Minimize2,
  FolderOpen,
  FileDiff,
  Package,
  ListChecks,
  LayoutTemplate,
  BookOpen,
} from "lucide-vue-next";
import {
  useWorkspaceTabs,
  workspaceFileKey,
  workspaceTabTitle,
  type WorkspacePage,
} from "../../composables/useWorkspaceTabs";
import { errorText } from "../../api/http";
import { workspacePlan } from "../../domain/workspacePlan";
import {
  workspaceAreaLabel,
  workspaceDisplayPath,
  workspaceLinkLocation,
  workspaceRootFiles,
  workspaceScopeId,
  type WorkspaceArea,
  type WorkspaceLocation,
} from "../../domain/workspaceView";
import { useIdentity } from "../../composables/useIdentity";
import { uploadProjectFile } from "../../composables/uploadProjectFile";
import type { WorkspaceFile } from "../../types/api";
import AppIcon from "../common/AppIcon.vue";
import FileTypeIcon from "../common/FileTypeIcon.vue";
import AsyncState from "../common/AsyncState.vue";
import type {
  ChatReference,
  PreviewAnchor,
  PreviewReference,
  PreviewAcceptance,
} from "../../domain/previewReferences";
import { isProjectFileReference } from "../../domain/previewReferences";
import FilePreview from "./FilePreview.vue";
import WorkspaceDeleteDialog from "./WorkspaceDeleteDialog.vue";
import KnowledgeSourcesView from "../conversation/KnowledgeSourcesView.vue";
import { replyKnowledgeReferences } from "../../domain/turnPresentation";

const props = withDefaults(
  defineProps<{
    projectId?: string;
    sessionId?: string;
    revision: string;
    visible: boolean;
    messages?: Msg[];
    plan?: { id: string; subject: string; state: string }[];
  }>(),
  { messages: () => [], plan: () => [] },
);
const emit = defineEmits<{
  close: [];
  uploaded: [];
  reference: [value: PreviewReference, accept: PreviewAcceptance];
}>();
const previews = new Map<string, InstanceType<typeof FilePreview>>();
function canLeavePreview() {
  return [...previews.values()].every((preview) => preview.canLeave());
}
function openReference(value: ChatReference) {
  if (value.projectId !== props.projectId) return;
  if (isProjectFileReference(value)) {
    const prefix = "artifacts/";
    const isArtifact = value.path.startsWith(prefix);
    select({
      path: isArtifact ? value.path.slice(prefix.length) : value.path,
      area: isArtifact ? "artifacts" : "uploads",
      scopeId: scopeId.value,
    });
    return;
  }
  if (!openFile(value.path, value.area)) return;
  if (selected.value) {
    selected.value.anchor = value;
    const preview = previews.get(previewKey(selected.value));
    // 历史引用重新核对已保存文件；有编辑草稿时保留实例，避免覆盖未保存内容。
    if (preview && !preview.hasPendingChanges()) preview.refresh();
  }
}
type Area = WorkspaceArea;
type Selection = {
  path: string;
  area: Area;
  scopeId: string;
  anchor?: PreviewAnchor;
  loaded?: boolean;
};
const scopeId = computed(() =>
  workspaceScopeId(props.projectId, props.sessionId),
);
const directory = ref<WorkspaceLocation | null>(null);
const artifactDirectory = ref("");
const expanded = ref(false);
const files = ref<WorkspaceFile[]>([]),
  loading = ref(false),
  error = ref(""),
  uploadError = ref(""),
  width = ref(500),
  resizing = ref(false),
  uploading = ref(false);
const { user } = useIdentity();
const taskStateLabels: Record<string, string> = {
  pending: "待开始",
  in_progress: "进行中",
  completed: "已完成",
};
const changeLabels = { created: "新增", modified: "修改", deleted: "删除" };
const changes = ref<FileChange[]>([]),
  nextCursor = ref<number | null>(null),
  scanError = ref("");
let controller: AbortController | null = null;
let changeController: AbortController | null = null;
let uploadController: AbortController | null = null;
const selectionKey = computed(() =>
  user.value && scopeId.value
    ? `egis_workspace_tabs:${user.value.user_id}:${scopeId.value}`
    : "",
);
const panelTabs = useWorkspaceTabs(
  scopeId,
  selectionKey,
  (item) => item.kind !== "file" || (previews.get(item.id)?.canLeave() ?? true),
);
const previewTabs = panelTabs.files;
const selected = panelTabs.selected;
const tab = panelTabs.page;
const sourceReferences = computed(() => {
  const selected = panelTabs.active.value;
  if (selected?.kind !== "sources") return [];
  const message = props.messages.find((message) => message.id === selected.replyId);
  return message ? replyKnowledgeReferences(message) : [];
});
const activePreview = computed(() => selected.value?.id || "");
const previewKey = workspaceFileKey;
const tabId = (id: string) => `workspace-tab-${encodeURIComponent(id)}`;
const panelId = (id: string) => `workspace-page-${encodeURIComponent(id)}`;
const pageIcons = {
  start: LayoutTemplate,
  workspace: FolderOpen,
  changes: FileDiff,
  artifacts: Package,
  plan: ListChecks,
  sources: BookOpen,
};
const startEntries = [
  { kind: "workspace", label: "查看工作空间", icon: FolderOpen },
  { kind: "changes", label: "查看变更", icon: FileDiff },
  { kind: "artifacts", label: "查看产物", icon: Package },
] as const;
const artifacts = ref<WorkspaceFile[]>([]);
const artifactsLoading = ref(false),
  artifactsError = ref("");
let artifactController: AbortController | null = null;
async function loadArtifacts() {
  artifactController?.abort();
  if (!props.visible || tab.value !== "start" || !props.projectId) return;
  artifactController = new AbortController();
  const signal = artifactController.signal,
    targetScope = scopeId.value;
  artifactsLoading.value = true;
  artifactsError.value = "";
  try {
    const result = await manager.files(
      props.projectId,
      "artifacts",
      "",
      signal,
      true,
    );
    if (!signal.aborted && targetScope === scopeId.value)
      artifacts.value = result.items
        .filter((file) => !file.is_directory)
        .map((file) => ({ ...file, area: "artifacts" }));
  } catch (error) {
    if (!signal.aborted) artifactsError.value = errorText(error);
  } finally {
    if (!signal.aborted) artifactsLoading.value = false;
  }
}
/** 文件更新时同步已打开的预览；各预览自己保护未保存编辑和未变化内容。 */
function refreshPreviews() {
  previews.forEach((preview) => preview.refresh());
}
watch(() => props.revision, refreshPreviews);
watch(
  () => props.visible,
  (visible) => {
    if (visible) refreshPreviews();
  },
);
function refresh() {
  refreshPreviews();
  if (tab.value === "changes") void loadChanges();
  else if (tab.value === "start") void loadArtifacts();
  else void load();
}
function registerPreview(node: unknown, key: string) {
  if (node) previews.set(key, node as InstanceType<typeof FilePreview>);
  else previews.delete(key);
}
async function tabKeydown(event: KeyboardEvent, index: number) {
  if (event.key === "Delete") {
    event.preventDefault();
    panelTabs.close(panelTabs.tabs.value[index]!);
    return;
  }
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const total = panelTabs.tabs.value.length;
  const target =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? total - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + total) % total;
  const next = panelTabs.tabs.value[target]!;
  panelTabs.activate(next);
  await nextTick();
  document.getElementById(tabId(next.id))?.focus();
}
/** 普通滚轮和触控板都在标签栏内横向滚动，保留浏览器的缩放手势。 */
function scrollPreviewTabs(event: WheelEvent) {
  if (event.ctrlKey) return;
  const strip = event.currentTarget as HTMLElement;
  if (strip.scrollWidth <= strip.clientWidth) return;
  const delta =
    Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.deltaY;
  const unit =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? strip.clientHeight
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? strip.clientWidth
        : 1;
  if (!delta) return;
  event.preventDefault();
  strip.scrollLeft += delta * unit;
}
watch(
  () => [panelTabs.activeId.value, props.visible, width.value, expanded.value],
  async () => {
    if (!props.visible) return;
    await nextTick();
    document
      .getElementById(tabId(panelTabs.activeId.value))
      ?.closest(".workspace-tab")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  },
);
const deleteTarget = ref<WorkspaceFile | null>(null);
const deleting = ref(false),
  deleteError = ref("");
function requestDelete(file: WorkspaceFile) {
  deleteTarget.value = file;
  deleteError.value = "";
}
async function deleteFile() {
  const target = deleteTarget.value;
  if (!props.projectId || !target || deleting.value || !target.path) return;
  const targetScope = scopeId.value;
  const area = target.area || currentLocation.value?.area || "uploads";
  deleting.value = true;
  deleteError.value = "";
  try {
    await manager.deleteFile(props.projectId, area, target.path);
    if (scopeId.value !== targetScope) return;
    panelTabs.removeFiles(
      (preview) =>
        preview.area === area &&
        (preview.path === target.path ||
          preview.path.startsWith(target.path + "/")),
    );
    deleteTarget.value = null;
    emit("uploaded"); // Reuse the project file revision notification.
    await load();
  } catch (e) {
    if (scopeId.value === targetScope) deleteError.value = errorText(e);
  } finally {
    deleting.value = false;
  }
}
function select(value: Selection) {
  panelTabs.openFile(value);
}
watch(
  selectionKey,
  () => {
    controller?.abort();
    changeController?.abort();
    uploadController?.abort();
    artifactController?.abort();
    artifacts.value = [];
    artifactsError.value = "";
    artifactDirectory.value = "";
    files.value = [];
    changes.value = [];
    nextCursor.value = null;
    scanError.value = "";
    directory.value = null;
    error.value = "";
    uploadError.value = "";
    deleteTarget.value = null;
    deleteError.value = "";
    uploading.value = false;
    loading.value = false;
  },
  { immediate: true, flush: "sync" },
);
const plan = computed(() =>
  workspacePlan(
    props.messages.filter(
      (message) => message.role === "assistant" && !message.finished_at,
    ),
    props.plan.map((item) => ({
      id: item.id,
      subject: item.subject,
      status: item.state,
    })),
  ),
);
const currentLocation = computed(() =>
  tab.value === "artifacts"
    ? { area: "artifacts" as const, path: artifactDirectory.value }
    : directory.value,
);
const crumbs = computed(() => {
  const location = currentLocation.value;
  if (!location) return [];
  const result: { label: string; location: WorkspaceLocation }[] = [];
  if (location.area !== "uploads" && tab.value !== "artifacts")
    result.push({
      label: workspaceAreaLabel[location.area],
      location: { area: location.area, path: "" },
    });
  const parts = location.path.split("/").filter(Boolean);
  return result.concat(
    parts.map((label, index) => ({
      label,
      location: {
        area: location.area,
        path: parts.slice(0, index + 1).join("/"),
      },
    })),
  );
});
async function loadChanges(more = false) {
  changeController?.abort();
  if (!props.visible || tab.value !== "changes" || !props.projectId) return;
  changeController = new AbortController();
  const signal = changeController.signal,
    targetScope = scopeId.value;
  loading.value = true;
  error.value = "";
  try {
    const result = await workspace.changes(
      props.projectId,
      more ? (nextCursor.value ?? undefined) : undefined,
      signal,
    );
    if (!signal.aborted && targetScope === scopeId.value) {
      changes.value = more ? [...changes.value, ...result.items] : result.items;
      nextCursor.value = result.next_cursor;
      scanError.value = result.scan_error?.message || "";
    }
  } catch (e) {
    if (!signal.aborted) error.value = errorText(e);
  } finally {
    if (!signal.aborted) loading.value = false;
  }
}
async function load() {
  controller?.abort();
  if (!props.visible || !["workspace", "artifacts"].includes(tab.value || ""))
    return;
  files.value = [];
  error.value = "";
  if (!props.projectId) {
    loading.value = false;
    return;
  }
  controller = new AbortController();
  const signal = controller.signal,
    targetScope = scopeId.value;
  loading.value = true;
  try {
    const location = currentLocation.value;
    const result = await manager.files(
      props.projectId,
      location?.area || "uploads",
      location?.path || "",
      signal,
    );
    if (!signal.aborted && targetScope === scopeId.value)
      files.value = location
        ? result.items.map((file) => ({ ...file, area: location.area }))
        : workspaceRootFiles(result.items);
  } catch (e) {
    if (!signal.aborted) error.value = errorText(e);
  } finally {
    if (!signal.aborted) loading.value = false;
  }
}
watch(
  () => [
    props.visible,
    scopeId.value,
    props.revision,
    tab.value,
    currentLocation.value,
  ],
  () => {
    void load();
    void loadChanges();
    void loadArtifacts();
  },
  { immediate: true },
);
function showTab(next: Exclude<WorkspacePage, "start">) {
  panelTabs.openPage(next);
}
function navigate(location: WorkspaceLocation | null) {
  if (tab.value === "artifacts") artifactDirectory.value = location?.path || "";
  else directory.value = location;
}
function choose(file: WorkspaceFile) {
  const area = file.area || currentLocation.value?.area || "uploads";
  if (file.is_directory) return navigate({ area, path: file.path });
  select({ path: file.path, area, scopeId: scopeId.value });
}
function openFile(path: string, area = "artifacts") {
  if (!scopeId.value) return;
  if (!["uploads", "work", "artifacts"].includes(area)) return;
  const location = workspaceLinkLocation(path, area as Area);
  select({ ...location, scopeId: scopeId.value });
  return true;
}
function openArtifacts() {
  artifactDirectory.value = "";
  panelTabs.openPage("artifacts");
}
function openSources(replyId: string) {
  panelTabs.openSources(replyId);
}
defineExpose({ openReference, openFile, openTab: showTab, openArtifacts, openSources });
async function upload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0],
    targetScope = scopeId.value;
  if (!file || !props.projectId || uploading.value) return;
  uploadController = new AbortController();
  const signal = uploadController.signal;
  uploading.value = true;
  uploadError.value = "";
  try {
    await uploadProjectFile(props.projectId, file, signal);
    if (signal.aborted || targetScope !== scopeId.value) return;
    navigate(null);
    await load();
    emit("uploaded");
  } catch (e) {
    if (!signal.aborted) uploadError.value = errorText(e);
  } finally {
    if (!signal.aborted) uploading.value = false;
    input.value = "";
  }
}
let stopResize: (() => void) | undefined;
function drag(event: PointerEvent) {
  if (event.button !== 0) return;
  stopResize?.();
  resizing.value = true;
  event.preventDefault();
  const start = event.clientX,
    initial = width.value;
  const move = (e: PointerEvent) => {
    width.value = Math.max(
      280,
      Math.min(850, window.innerWidth - 420, initial + start - e.clientX),
    );
  };
  const end = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    stopResize = undefined;
    resizing.value = false;
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end, { once: true });
  window.addEventListener("pointercancel", end, { once: true });
  stopResize = end;
}
onUnmounted(() => {
  stopResize?.();
  controller?.abort();
  changeController?.abort();
  uploadController?.abort();
  artifactController?.abort();
});
</script>
<template>
  <Transition name="workspace"
    ><aside
      v-show="visible"
      class="workspace-panel"
      :class="{ 'is-resizing': resizing, 'is-expanded': expanded }"
      :style="{ '--workspace-width': `${width}px`, width: `${width}px` }"
      :inert="!visible"
      :aria-hidden="!visible || undefined"
    >
      <div class="workspace-content">
        <div
          class="resize-handle"
          role="separator"
          aria-label="调整工作区宽度"
          aria-orientation="vertical"
          tabindex="0"
          @pointerdown="drag"
          @keydown.left.prevent="width = Math.min(850, width + 30)"
          @keydown.right.prevent="width = Math.max(280, width - 30)"
        ></div>
        <header class="workspace-header">
          <div
            class="workspace-tab-strip"
            role="tablist"
            aria-label="工作区标签"
            @wheel="scrollPreviewTabs"
          >
            <div
              v-for="(item, index) in panelTabs.tabs.value"
              :key="item.id"
              class="workspace-tab"
              :class="{
                active: panelTabs.activeId.value === item.id,
                'file-tab': item.kind === 'file',
              }"
            >
              <button
                role="tab"
                :id="tabId(item.id)"
                :aria-selected="panelTabs.activeId.value === item.id"
                :aria-controls="panelId(item.id)"
                :tabindex="panelTabs.activeId.value === item.id ? 0 : -1"
                :title="
                  item.kind === 'file'
                    ? workspaceDisplayPath(item.area, item.path)
                    : workspaceTabTitle(item)
                "
                @click="panelTabs.activate(item)"
                @keydown="tabKeydown($event, index)"
              >
                <FileTypeIcon
                  v-if="item.kind === 'file'"
                  :name="item.path"
                  :size="16"
                />
                <component v-else :is="pageIcons[item.kind]" :size="16" />
                <span>{{ workspaceTabTitle(item) }}</span>
              </button>
              <button
                class="workspace-tab-close"
                :aria-label="`关闭标签 ${workspaceTabTitle(item)}`"
                @click="panelTabs.close(item)"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
          </div>
          <div class="header-actions">
            <button
              v-if="selected && !/\.(xlsx|pptx?)$/i.test(selected.path)"
              class="plain"
              aria-label="下载文件"
              @click="previews.get(activePreview)?.download()"
            >
              <AppIcon name="download" :size="16" />
            </button>
            <button
              class="plain"
              aria-label="新标签页"
              title="新标签页"
              @click="panelTabs.newTab"
            >
              <Plus :size="18" />
            </button>
            <button
              class="plain"
              aria-label="刷新文件"
              title="刷新当前页面"
              @click="refresh"
            >
              <RotateCw :size="15" />
            </button>
            <button
              class="plain"
              :aria-label="expanded ? '还原工作区' : '放大工作区'"
              :title="expanded ? '还原工作区' : '放大工作区'"
              @click="expanded = !expanded"
            >
              <Minimize2 v-if="expanded" :size="16" /><Maximize2
                v-else
                :size="16"
              />
            </button>
            <button
              class="plain"
              aria-label="关闭工作空间"
              title="收起工作区"
              @click="canLeavePreview() && $emit('close')"
            >
              <PanelRightClose :size="18" />
            </button>
          </div>
        </header>
        <div
          v-if="tab !== 'preview'"
          class="workspace-page"
          role="tabpanel"
          :id="panelId(panelTabs.activeId.value)"
          :aria-labelledby="tabId(panelTabs.activeId.value)"
        >
          <section v-if="tab === 'start'" class="workspace-start">
            <div class="workspace-start-content">
              <nav class="workspace-start-actions" aria-label="打开工作区页面">
                <button
                  v-for="entry in startEntries"
                  :key="entry.kind"
                  @click="showTab(entry.kind)"
                >
                  <component :is="entry.icon" :size="19" /><span>{{
                    entry.label
                  }}</span
                  ><AppIcon name="chevron" :size="13" />
                </button>
              </nav>
              <button class="workspace-start-plan" @click="showTab('plan')">
                <ListChecks :size="16" />查看计划<span v-if="plan.length"
                  >{{
                    plan.filter((item) => item.status === "completed").length
                  }}
                  / {{ plan.length }}</span
                >
              </button>
              <section class="workspace-start-artifacts" aria-label="项目产物">
                <div class="workspace-start-section-heading">
                  <span
                    >产物<span v-if="!artifactsLoading">
                      ({{ artifacts.length }})</span
                    ></span
                  ><button v-if="artifacts.length > 6" @click="openArtifacts">
                    查看全部
                  </button>
                </div>
                <AsyncState
                  :loading="artifactsLoading"
                  :error="artifactsError"
                  :empty="!artifacts.length"
                  empty-title="暂无产物"
                  empty-text="助手交付的文件会显示在这里。"
                  @retry="loadArtifacts"
                >
                  <ul>
                    <li v-for="file in artifacts.slice(0, 6)" :key="file.path">
                      <button :title="file.path" @click="choose(file)">
                        <FileTypeIcon :name="file.name" :size="19" /><span>{{
                          file.name
                        }}</span>
                      </button>
                    </li>
                  </ul>
                </AsyncState>
              </section>
            </div>
          </section>
          <KnowledgeSourcesView v-else-if="tab === 'sources'" :references="sourceReferences" />
          <section v-else-if="tab === 'plan'" class="plan">
            <div v-if="!plan.length" class="empty-message">
              <h3>暂无计划</h3>
              <p>当助手创建任务计划时，进度会显示在这里。</p>
            </div>
            <ul v-else>
              <li v-for="item in plan" :key="item.id">
                <span class="plan-status">{{
                  item.status === "completed"
                    ? "✓"
                    : item.status === "in_progress"
                      ? "◌"
                      : "○"
                }}</span
                ><span>{{ item.subject }}</span
                ><small>{{
                  taskStateLabels[item.status] || item.status
                }}</small>
              </li>
            </ul>
          </section>
          <template v-else-if="tab === 'workspace' || tab === 'artifacts'"
            ><div class="list-toolbar">
              <div class="breadcrumb">
                <button @click="navigate(null)">
                  {{ tab === "artifacts" ? "产物" : "工作空间" }}</button
                ><template v-for="(part, index) in crumbs" :key="index"
                  ><span>/</span
                  ><button @click="navigate(part.location)">
                    {{ part.label }}
                  </button></template
                >
              </div>
              <label v-if="tab === 'workspace' && scopeId" class="upload"
                >{{ uploading ? "上传中…" : "上传"
                }}<input type="file" :disabled="uploading" @change="upload"
              /></label>
            </div>
            <p
              v-if="tab === 'workspace' && uploadError"
              class="error upload-error"
              role="alert"
            >
              {{ uploadError }}
            </p>
            <div class="file-tree">
              <AsyncState
                :loading="loading"
                :error="error"
                :empty="!files.length"
                :empty-title="
                  scopeId
                    ? tab === 'artifacts'
                      ? '暂无产物'
                      : '暂无文件'
                    : '尚未选择项目'
                "
                :empty-text="
                  scopeId
                    ? '当前项目的资料和过程文件会显示在这里。'
                    : '选择项目后可上传资料并查看项目文件。'
                "
                @retry="load"
                ><div
                  v-for="file in files"
                  :key="`${file.area}:${file.is_directory}:${file.path}`"
                  class="file-row"
                  @click="choose(file)"
                  :class="{
                    'is-hidden-directory':
                      tab === 'workspace' &&
                      !directory &&
                      file.area === 'work' &&
                      file.is_directory,
                  }"
                >
                  <button type="button" class="file-open" @click.stop="choose(file)">
                    <AppIcon
                      v-if="file.is_directory"
                      name="folder"
                      :size="24"
                    />
                    <FileTypeIcon v-else :name="file.name" :size="26" />
                    <span :title="file.name">{{ file.name }}</span
                    ><small v-if="!file.is_directory"
                      >{{ Math.ceil(file.size / 1024) }} KB</small
                    ><AppIcon v-else name="chevron" :size="12" />
                  </button>
                  <button
                    v-if="file.path"
                    type="button"
                    class="file-delete"
                    :aria-label="`删除${file.name}`"
                    :disabled="deleting"
                    @click.stop="requestDelete(file)"
                  >
                    <AppIcon name="trash" :size="16" />
                  </button>
                </div>
              </AsyncState></div
          ></template>
          <section v-else-if="tab === 'changes'" class="changes-view">
            <div class="changes-heading">
              <span>当前项目的文件变更</span><span>{{ changes.length }}</span>
            </div>
            <p class="changes-description">
              仅记录当前项目的文件变更，时间为观察时间。
            </p>
            <p v-if="scanError" class="changes-description" role="status">
              最近一次扫描未完成：{{ scanError }}
            </p>
            <AsyncState
              :loading="loading"
              :error="error"
              :empty="!changes.length"
              empty-title="暂无本地文件变更"
              empty-text="已有文件作为基线，不会显示为新增。"
              @retry="loadChanges()"
              ><ul class="changes-list">
                <li v-for="change in changes" :key="change.change_id">
                  <button
                    type="button"
                    :disabled="change.change_type === 'deleted'"
                    :title="change.path"
                    @click="openFile(change.path, change.area)"
                  >
                    <FileTypeIcon :name="change.path" :size="26" /><span
                      class="change-name"
                      ><strong>{{ change.path.split("/").pop() }}</strong
                      ><small
                        >{{ workspaceDisplayPath(change.area, change.path) }} ·
                        观察于
                        {{
                          new Date(change.observed_at).toLocaleString()
                        }}</small
                      ></span
                    ><span class="change-status">{{
                      changeLabels[change.change_type]
                    }}</span>
                  </button>
                </li>
              </ul>
              <button v-if="nextCursor" class="back" @click="loadChanges(true)">
                加载更多
              </button></AsyncState
            >
          </section>
        </div>
        <section
          v-show="tab === 'preview'"
          class="preview-view"
          :inert="tab !== 'preview'"
        >
          <template v-if="projectId">
            <div
              v-for="item in previewTabs"
              :key="previewKey(item)"
              v-show="activePreview === previewKey(item)"
              class="preview-document"
              role="tabpanel"
              :id="panelId(item.id)"
              :aria-labelledby="tabId(item.id)"
              :inert="activePreview !== previewKey(item)"
            >
              <FilePreview
                v-if="item.loaded"
                :ref="(node) => registerPreview(node, previewKey(item))"
                :project-id="projectId"
                :area="item.area"
                :path="item.path"
                :anchor="item.anchor"
                @reference="(value, accept) => emit('reference', value, accept)"
                @saved="emit('uploaded')"
              />
            </div>
          </template>
        </section>
      </div></aside
  ></Transition>
  <WorkspaceDeleteDialog
    v-if="deleteTarget"
    :name="deleteTarget.name"
    :is-directory="deleteTarget.is_directory"
    :pending="deleting"
    :error="deleteError"
    @cancel="deleteTarget = null"
    @confirm="deleteFile"
  />
</template>
<style scoped src="./WorkspacePanel.css"></style>
