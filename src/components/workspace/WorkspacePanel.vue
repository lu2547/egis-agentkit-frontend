<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from "vue";
import type { Msg } from "@agentscope-ai/agentscope/message";
import { manager } from "../../api/manager";
import { workspace, type FileChange } from "../../api/workspace";
import { PanelRightClose, RotateCw } from "lucide-vue-next";
import { errorText } from "../../api/http";
import { workspacePlan } from "../../domain/workspacePlan";
import {
  workspaceAreaLabel,
  workspaceDisplayPath,
  workspaceLinkLocation,
  workspaceRootFiles,
  type WorkspaceArea,
  type WorkspaceLocation,
} from "../../domain/workspaceView";
import { useIdentity } from "../../composables/useIdentity";
import type { WorkspaceFile } from "../../types/api";
import AppIcon from "../common/AppIcon.vue";
import FileTypeIcon from "../common/FileTypeIcon.vue";
import AsyncState from "../common/AsyncState.vue";
import FilePreview from "./FilePreview.vue";

const props = withDefaults(
  defineProps<{
    sessionId: string;
    projectId?: string;
    revision: string;
    visible: boolean;
    messages?: Msg[];
    plan?: { id: string; subject: string; state: string }[];
  }>(),
  { messages: () => [] },
);
const emit = defineEmits<{ close: []; uploaded: [] }>();
type Tab = "plan" | "workspace" | "artifacts" | "changes" | "preview";
type Area = WorkspaceArea;
type Selection = { path: string; area: Area; scopeId: string };
const scopeId = computed(() =>
  props.projectId ? `project:${props.projectId}` : props.sessionId,
);
const tab = ref<Tab>("workspace"),
  lastList = ref<"workspace" | "artifacts">("workspace");
const directory = ref<WorkspaceLocation | null>(null);
const artifactDirectory = ref(""),
  files = ref<WorkspaceFile[]>([]),
  loading = ref(false),
  error = ref(""),
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
    ? `egis_workspace_preview:${user.value.user_id}:${scopeId.value}`
    : "",
);
function restoreSelection(): Selection | null {
  try {
    const value = JSON.parse(
      selectionKey.value
        ? sessionStorage.getItem(selectionKey.value) || "null"
        : "null",
    );
    return value &&
      typeof value.path === "string" &&
      ["uploads", "work", "artifacts"].includes(value.area) &&
      value.scopeId === scopeId.value
      ? value
      : null;
  } catch {
    return null;
  }
}
const selected = ref<Selection | null>(null);
function select(value: Selection) {
  selected.value = value;
  if (selectionKey.value)
    sessionStorage.setItem(selectionKey.value, JSON.stringify(value));
}
watch(
  selectionKey,
  () => {
    // Files and preview belong to the project; legacy sessions remain isolated.
    controller?.abort();
    changeController?.abort();
    uploadController?.abort();
    files.value = [];
    changes.value = [];
    nextCursor.value = null;
    scanError.value = "";
    directory.value = null;
    artifactDirectory.value = "";
    error.value = "";
    uploading.value = false;
    loading.value = false;
    selected.value = restoreSelection();
    if (selected.value) tab.value = "preview";
    else if (tab.value === "preview") tab.value = "workspace";
  },
  { immediate: true, flush: "sync" },
);
const plan = computed(() =>
  props.plan === undefined
    ? workspacePlan(props.messages)
    : workspacePlan(
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
const currentLocation = computed<WorkspaceLocation | null>(() =>
  tab.value === "artifacts"
    ? { area: "artifacts", path: artifactDirectory.value }
    : directory.value,
);
const crumbs = computed(() => {
  const location = currentLocation.value;
  if (!location) return [];
  const result: { label: string; location: WorkspaceLocation }[] = [];
  if (tab.value === "workspace" && location.area !== "uploads")
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
  if (!props.visible || tab.value !== "changes" || !scopeId.value) return;
  changeController = new AbortController();
  const signal = changeController.signal,
    targetScope = scopeId.value;
  loading.value = true;
  error.value = "";
  try {
    const result = await workspace.changes(
      props.sessionId,
      more ? (nextCursor.value ?? undefined) : undefined,
      signal,
      props.projectId,
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
  if (
    !props.visible ||
    (tab.value !== "workspace" && tab.value !== "artifacts")
  )
    return;
  files.value = [];
  error.value = "";
  if (!scopeId.value) {
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
      props.sessionId,
      location?.area || "uploads",
      location?.path || "",
      signal,
      false,
      props.projectId,
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
    directory.value,
    artifactDirectory.value,
  ],
  () => {
    void load();
    void loadChanges();
  },
  { immediate: true },
);
function showTab(next: Tab) {
  if (next === "workspace" || next === "artifacts") lastList.value = next;
  tab.value = next;
}
function navigate(location: WorkspaceLocation | null) {
  if (tab.value === "artifacts") artifactDirectory.value = location?.path || "";
  else directory.value = location;
}
function choose(file: WorkspaceFile) {
  const area = file.area || currentLocation.value?.area || "uploads";
  if (file.is_directory) return navigate({ area, path: file.path });
  select({ path: file.path, area, scopeId: scopeId.value });
  showTab("preview");
}
function openFile(path: string, area = "artifacts") {
  if (!scopeId.value) return;
  if (!["uploads", "work", "artifacts"].includes(area)) return;
  const location = workspaceLinkLocation(path, area as Area);
  select({ ...location, scopeId: scopeId.value });
  lastList.value = location.area === "artifacts" ? "artifacts" : "workspace";
  showTab("preview");
}
defineExpose({ openFile, openTab: showTab });
async function upload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0],
    targetScope = scopeId.value;
  if (!file || !targetScope || uploading.value) return;
  uploadController = new AbortController();
  const signal = uploadController.signal;
  uploading.value = true;
  error.value = "";
  try {
    await manager.uploadFile(props.sessionId, file, signal, props.projectId);
    if (signal.aborted || targetScope !== scopeId.value) return;
    directory.value = null;
    await load();
    emit("uploaded");
  } catch (e) {
    if (!signal.aborted) error.value = errorText(e);
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
});
</script>
<template>
  <Transition name="workspace"
    ><aside
      v-show="visible"
      class="workspace-panel"
      :class="{ 'is-resizing': resizing }"
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
          <div class="header-main">
            <div class="view-title"><span>工作空间</span></div>
            <div class="header-actions">
              <button
                class="plain"
                aria-label="刷新文件"
                @click="tab === 'changes' ? loadChanges() : load()"
              >
                <RotateCw :size="16" /></button
              ><button
                class="plain"
                aria-label="关闭工作空间"
                @click="$emit('close')"
              >
                <PanelRightClose :size="19" />
              </button>
            </div>
          </div>
          <nav class="workspace-tabs" aria-label="工作空间面板">
            <button
              v-for="item in [
                ['plan', '计划'],
                ['workspace', '文件'],
                ['artifacts', '产物'],
                ['changes', '变更'],
                ['preview', '预览'],
              ] as const"
              :key="item[0]"
              :class="{ active: tab === item[0] }"
              @click="showTab(item[0])"
            >
              {{ item[1] }}
            </button>
          </nav>
        </header>
        <section v-if="tab === 'plan'" class="plan">
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
              ><small>{{ taskStateLabels[item.status] || item.status }}</small>
            </li>
          </ul>
        </section>
        <template v-else-if="tab === 'workspace' || tab === 'artifacts'"
          ><div class="list-toolbar">
            <div class="breadcrumb">
              <button @click="navigate(null)">
                {{ tab === "workspace" ? "工作空间" : "产物" }}</button
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
          <div class="file-tree">
            <AsyncState
              :loading="loading"
              :error="error"
              :empty="!files.length"
              :empty-title="scopeId ? '暂无文件' : '尚未选择项目'"
              :empty-text="
                tab === 'artifacts'
                  ? '当前项目的交付文件会显示在这里。'
                  : scopeId
                    ? '当前项目的资料和过程文件会显示在这里。'
                    : '选择项目后可上传资料并查看项目文件。'
              "
              @retry="load"
              ><button
                v-for="file in files"
                :key="`${file.area}:${file.is_directory}:${file.path}`"
                class="file-row"
                :class="{
                  'is-hidden-directory':
                    tab === 'workspace' &&
                    !directory &&
                    file.area === 'work' &&
                    file.is_directory,
                }"
                @click="choose(file)"
              >
                <AppIcon v-if="file.is_directory" name="folder" :size="24" />
                <FileTypeIcon v-else :name="file.name" :size="26" />
                <span :title="file.name">{{ file.name }}</span
                ><small v-if="!file.is_directory"
                  >{{ Math.ceil(file.size / 1024) }} KB</small
                ><AppIcon v-else name="chevron" :size="12" /></button
            ></AsyncState></div
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
                      {{ new Date(change.observed_at).toLocaleString() }}</small
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
        <template v-else
          ><button class="back" @click="showTab(lastList)">
            ‹ 返回{{ lastList === "workspace" ? "工作空间" : "产物" }}</button
          ><FilePreview
            v-if="selected && selected.scopeId === scopeId"
            :session-id="sessionId"
            :project-id="projectId"
            :area="selected.area"
            :path="selected.path"
          />
          <div v-else class="empty-message">
            <h3>暂无预览</h3>
            <p>选择一个文件后可在此查看。</p>
          </div></template
        >
      </div>
    </aside></Transition
  >
</template>
<style scoped src="./WorkspacePanel.css"></style>
