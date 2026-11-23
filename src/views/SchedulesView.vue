<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  watch,
} from "vue";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  ChevronDown,
  Clock,
  ListFilter,
  Menu,
  PanelRight,
  Pencil,
  Play,
  Plus,
  Search,
} from "lucide-vue-next";
import { useRoute, useRouter, type LocationQueryRaw } from "vue-router";
import { errorText } from "../api/http";
import {
  scheduleApi,
  type RunStatus,
  type Schedule,
  type ScheduleForm,
  type ScheduleRun,
} from "../api/schedules";
import {
  newSchedule,
  nextRunLabel,
  ruleLabel,
  runStatuses,
  scheduleTemplates,
} from "../domain/schedules";
import { useWorkbenchLayout } from "../composables/useWorkbenchLayout";
import DialogShell from "../components/common/DialogShell.vue";
import IconButton from "../components/common/IconButton.vue";
import ScheduleEditor from "../components/schedules/ScheduleEditor.vue";
import ScheduleRuns from "../components/schedules/ScheduleRuns.vue";
import ScheduleSelect from "../components/schedules/ScheduleSelect.vue";
import ScheduleTimeline from "../components/schedules/ScheduleTimeline.vue";
import WorkspacePanel from "../components/workspace/WorkspacePanel.vue";

const router = useRouter();
const route = useRoute();
const layout = useWorkbenchLayout();
const searchInput = ref<HTMLInputElement>();
const tasks = ref<Schedule[]>([]);
const runs = ref<ScheduleRun[]>([]);
const runTaskNames = ref(new Map<string, string>());
const taskError = ref("");
const runError = ref("");
const actionError = ref("");
const tasksLoading = ref(true);
const runsLoading = ref(false);
const pending = ref(false);
const saving = ref(false);
const editor = shallowRef<{
  initial: ScheduleForm;
  id?: string;
}>();
const saveError = ref("");
const confirmation = shallowRef<{
  label: string;
  message: string;
  action: () => Promise<void>;
  danger?: boolean;
}>();
const confirmError = ref("");
const notice = ref("");
const now = ref(Date.now());
const showWorkspace = ref(false);
const searchOpen = ref(false);
const menu = ref<"scope" | "new">();
const batch = ref(false);
const selected = ref(new Set<string>());
const scope = ref<"all" | "sandbox">("all");
const runScope = ref<"all" | "sandbox">("all");
const taskSearch = ref("");
const taskStatus = ref<"all" | "enabled" | "paused">("all");
const runFilters = computed(() => ({
  schedule_id:
    typeof route.query.task === "string" ? route.query.task : undefined,
  status:
    typeof route.query.status === "string" &&
    Object.hasOwn(runStatuses, route.query.status)
      ? (route.query.status as RunStatus)
      : undefined,
  q: typeof route.query.q === "string" ? route.query.q : undefined,
  archived: route.query.archived === "true" ? "true" : undefined,
}));
const view = computed(() => {
  const value = route.query.view;
  if (value === "runs" || value === "templates") return value;
  return typeof route.query.detail === "string" ? "detail" : "tasks";
});
const currentTask = computed(() =>
  tasks.value.find((task) => task.id === route.query.detail),
);
const taskCounts = computed(() => {
  const enabled = tasks.value.filter((task) => task.enabled).length;
  return [
    { key: "all", label: "全部", count: tasks.value.length },
    { key: "enabled", label: "已启用", count: enabled },
    { key: "paused", label: "已暂停", count: tasks.value.length - enabled },
  ] as const;
});
const visibleTasks = computed(() => {
  const search = taskSearch.value.trim().toLocaleLowerCase();
  return tasks.value.filter(
    (task) =>
      (taskStatus.value === "all" ||
        task.enabled === (taskStatus.value === "enabled")) &&
      `${task.name} ${task.description}`.toLocaleLowerCase().includes(search),
  );
});
const allSelected = computed(
  () =>
    visibleTasks.value.length > 0 &&
    visibleTasks.value.every((task) => selected.value.has(task.id)),
);
const statusOptions = [
  { value: "", label: "全部状态" },
  ...Object.entries(runStatuses).map(([value, label]) => ({ value, label })),
];
const environmentOptions = [
  { value: "all", label: "全部类型" },
  { value: "sandbox", label: "企业沙箱" },
] as const;
const taskOptions = computed(() => {
  const names = new Map(runTaskNames.value);
  tasks.value.forEach((task) => names.set(task.id, task.name));
  const selected = runFilters.value.schedule_id;
  if (selected && !names.has(selected)) names.set(selected, "所选任务");
  return [
    { value: "", label: "全部任务" },
    ...Array.from(names, ([value, label]) => ({ value, label })),
  ];
});
const workspaceRevision = computed(() =>
  runs.value.map((run) => `${run.id}:${run.status}`).join("|"),
);
let controller: AbortController | undefined;
let runTimer: ReturnType<typeof setInterval>;
let clockTimer: ReturnType<typeof setInterval>;
let taskRevision = 0;
let taskRequestPending = false;
let lastTaskRequest = 0;

function navigate(query: LocationQueryRaw = {}) {
  menu.value = undefined;
  return router.push({ path: "/schedules", query });
}

function openScheduleConversation() {
  return router.push({
    path: "/",
    query: { prompt: "帮我创建一个定时任务：" },
  });
}

function updateFilters(key: string, value?: string) {
  menu.value = undefined;
  void router.replace({ query: { ...route.query, [key]: value || undefined } });
}

async function loadTasks(background = false) {
  if (taskRequestPending) return;
  const revision = taskRevision;
  taskRequestPending = true;
  lastTaskRequest = Date.now();
  if (!background) {
    tasksLoading.value = true;
    taskError.value = "";
  }
  try {
    const { items } = await scheduleApi.list();
    if (revision === taskRevision) tasks.value = items;
  } catch (e) {
    if (!background && revision === taskRevision)
      taskError.value = errorText(e);
  } finally {
    taskRequestPending = false;
    tasksLoading.value = false;
  }
}

async function loadRuns(reset = false) {
  if (view.value !== "runs" && view.value !== "detail") return;
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  if (reset) {
    runs.value = [];
    runError.value = "";
    runsLoading.value = true;
  }
  try {
    const query =
      view.value === "detail"
        ? { schedule_id: String(route.query.detail) }
        : runFilters.value;
    const { items } = await scheduleApi.runs(query, signal);
    if (signal.aborted) return;
    runs.value = items;
    items.forEach((run) =>
      runTaskNames.value.set(run.schedule_id, run.schedule_name),
    );
    runError.value = "";
  } catch (e) {
    if (!signal.aborted) runError.value = errorText(e);
  } finally {
    if (!signal.aborted) runsLoading.value = false;
  }
}

watch(
  () => route.fullPath,
  () => {
    if (route.path !== "/schedules") return;
    if (view.value === "runs" || view.value === "detail") void loadRuns(true);
    else controller?.abort();
  },
  { immediate: true },
);

watch(view, () => {
  menu.value = undefined;
  searchOpen.value = false;
  showWorkspace.value = false;
  notice.value = "";
  actionError.value = "";
  finishBatch();
});

function outside(event: PointerEvent) {
  if (
    event.target instanceof Element &&
    !event.target.closest(".schedule-menu-anchor")
  )
    menu.value = undefined;
}

onMounted(() => {
  void loadTasks();
  runTimer = setInterval(() => {
    if (document.hidden || pending.value || saving.value) return;
    if (!runsLoading.value) void loadRuns();
    if (
      (view.value === "tasks" || view.value === "detail") &&
      !taskError.value &&
      Date.now() - lastTaskRequest >= 10000
    )
      void loadTasks(true);
  }, 2500);
  clockTimer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
  window.addEventListener("pointerdown", outside);
});

onUnmounted(() => {
  controller?.abort();
  clearInterval(runTimer);
  clearInterval(clockTimer);
  window.removeEventListener("pointerdown", outside);
});

function toggleMenu(value: typeof menu.value) {
  menu.value = menu.value === value ? undefined : value;
}

async function openSearch() {
  searchOpen.value = true;
  await nextTick();
  searchInput.value?.focus();
}

function closeSearch() {
  if (view.value === "runs") updateFilters("q");
  else taskSearch.value = "";
  searchOpen.value = false;
}

function finishBatch() {
  batch.value = false;
  selected.value.clear();
}

function selectTask(id: string) {
  if (selected.value.has(id)) selected.value.delete(id);
  else selected.value.add(id);
}

function selectAll() {
  const checked = allSelected.value;
  for (const task of visibleTasks.value) {
    if (checked) selected.value.delete(task.id);
    else selected.value.add(task.id);
  }
}

function replaceTask(task: Schedule) {
  taskRevision++;
  const index = tasks.value.findIndex((item) => item.id === task.id);
  if (index === -1) tasks.value.unshift(task);
  else tasks.value[index] = task;
}

async function toggleTask(task: Schedule) {
  if (pending.value) return;
  pending.value = true;
  actionError.value = "";
  try {
    replaceTask(await scheduleApi.update(task.id, { enabled: !task.enabled }));
  } catch (e) {
    actionError.value = errorText(e);
  } finally {
    pending.value = false;
  }
}

function beginEditor(initial: ScheduleForm, id?: string) {
  saveError.value = "";
  editor.value = { initial, id };
}

async function save(form: ScheduleForm) {
  if (!editor.value || saving.value) return;
  const id = editor.value.id;
  saving.value = true;
  saveError.value = "";
  try {
    replaceTask(
      await (id ? scheduleApi.update(id, form) : scheduleApi.create(form)),
    );
    editor.value = undefined;
    if (!id) {
      taskStatus.value = "all";
      taskSearch.value = "";
      await navigate();
    }
  } catch (e) {
    saveError.value = errorText(e);
  } finally {
    saving.value = false;
  }
}

function confirm(
  label: string,
  message: string,
  action: () => Promise<void>,
  danger = false,
) {
  confirmError.value = "";
  confirmation.value = { label, message, action, danger };
}

async function performConfirmed() {
  if (!confirmation.value || pending.value) return;
  pending.value = true;
  confirmError.value = "";
  try {
    await confirmation.value.action();
    confirmation.value = undefined;
  } catch (e) {
    confirmError.value = errorText(e);
  } finally {
    pending.value = false;
  }
}

function deleteTasks() {
  const targets = new Set(selected.value);
  const ids = [...targets];
  if (!ids.length) return;
  confirm(
    "删除定时任务",
    `将删除选中的 ${ids.length} 项任务并停止后续触发。已有运行记录仍可查看。`,
    async () => {
      await scheduleApi.removeBatch(ids);
      taskRevision++;
      tasks.value = tasks.value.filter((task) => !targets.has(task.id));
      finishBatch();
    },
    true,
  );
}

function tryRun(task: Schedule) {
  confirm(
    "测试运行",
    `立即运行「${task.name}」一次。下一次计划运行时间保持原样。`,
    async () => {
      const run = await scheduleApi.run(task.id);
      runs.value = [run, ...runs.value.filter((item) => item.id !== run.id)];
      notice.value = "已提交测试运行。";
      void loadRuns();
    },
  );
}

async function archive(run: ScheduleRun) {
  if (pending.value) return;
  pending.value = true;
  actionError.value = "";
  try {
    await scheduleApi.archive(run.id, !run.archived_at);
    runs.value = runs.value.filter((item) => item.id !== run.id);
    void loadRuns();
  } catch (e) {
    actionError.value = errorText(e);
  } finally {
    pending.value = false;
  }
}

function deleteRun(run: ScheduleRun) {
  confirm(
    "删除运行记录",
    `删除「${run.schedule_name}」的这条运行记录？`,
    async () => {
      await scheduleApi.removeRun(run.id);
      runs.value = runs.value.filter((item) => item.id !== run.id);
      void loadRuns();
    },
    true,
  );
}
</script>

<template>
  <section
    class="schedules-page"
    aria-label="定时任务"
    @keydown.esc="menu = undefined"
  >
    <div class="schedule-frame">
      <header class="schedule-header">
        <div class="schedule-header-main">
          <IconButton
            v-if="layout.isMobile.value"
            label="打开导航"
            @click="layout.toggleSidebar"
            ><Menu :size="19"
          /></IconButton>
          <nav
            v-if="view === 'tasks' || view === 'runs'"
            class="schedule-tabs"
            aria-label="定时任务视图"
          >
            <button
              type="button"
              :aria-current="view === 'tasks' ? 'page' : undefined"
              @click="navigate()"
            >
              定时任务
            </button>
            <button
              type="button"
              :aria-current="view === 'runs' ? 'page' : undefined"
              @click="navigate({ view: 'runs' })"
            >
              运行记录
            </button>
          </nav>
          <template v-else>
            <IconButton label="返回定时任务" @click="navigate()"
              ><ArrowLeft :size="18"
            /></IconButton>
            <h1>
              {{
                view === "templates"
                  ? "从模板新建"
                  : currentTask?.name || "任务详情"
              }}
            </h1>
            <span
              v-if="view === 'detail' && currentTask"
              class="schedule-detail-rule"
              >{{ ruleLabel(currentTask.rule) }}</span
            >
          </template>
        </div>

        <div
          v-if="view === 'tasks' || view === 'runs'"
          class="schedule-toolbar"
        >
          <div v-if="view === 'tasks'" class="schedule-menu-anchor">
            <IconButton
              class="schedule-tool-button"
              label="筛选执行环境"
              :active="scope !== 'all'"
              :aria-expanded="menu === 'scope'"
              @click="toggleMenu('scope')"
              ><ListFilter :size="17"
            /></IconButton>
            <div v-if="menu === 'scope'" class="schedule-menu">
              <button
                type="button"
                :aria-pressed="scope === 'all'"
                @click="
                  scope = 'all';
                  menu = undefined;
                "
              >
                全部
                <span
                  >{{ tasks.length }} <Check v-if="scope === 'all'" :size="13"
                /></span>
              </button>
              <button
                type="button"
                :aria-pressed="scope === 'sandbox'"
                @click="
                  scope = 'sandbox';
                  menu = undefined;
                "
              >
                企业沙箱
                <span
                  >{{ tasks.length }}
                  <Check v-if="scope === 'sandbox'" :size="13"
                /></span>
              </button>
            </div>
          </div>
          <div
            v-if="
              searchOpen ||
              (view === 'runs' && runFilters.q) ||
              (view === 'tasks' && taskSearch)
            "
            class="schedule-search-box"
          >
            <input
              ref="searchInput"
              type="search"
              :aria-label="view === 'runs' ? '搜索运行记录' : '搜索定时任务'"
              :placeholder="view === 'runs' ? '搜索运行记录' : '搜索定时任务'"
              :value="view === 'runs' ? runFilters.q || '' : taskSearch"
              @input="
                view === 'runs'
                  ? updateFilters(
                      'q',
                      ($event.target as HTMLInputElement).value,
                    )
                  : (taskSearch = ($event.target as HTMLInputElement).value)
              "
              @keydown.esc.stop="closeSearch"
            />
          </div>
          <IconButton
            v-else
            class="schedule-tool-button"
            :label="view === 'runs' ? '搜索运行记录' : '搜索定时任务'"
            @click="openSearch"
            ><Search :size="17"
          /></IconButton>

          <template v-if="view === 'tasks'">
            <button
              v-if="batch"
              type="button"
              class="schedule-button quiet"
              @click="finishBatch"
            >
              取消
            </button>
            <button
              v-else
              type="button"
              class="schedule-button"
              @click="batch = true"
            >
              批量管理
            </button>
            <div class="schedule-menu-anchor">
              <div class="schedule-split">
                <button
                  type="button"
                  class="schedule-button primary"
                  @click="openScheduleConversation"
                >
                  <Plus :size="16" aria-hidden="true" /> 新建
                </button>
                <button
                  type="button"
                  class="schedule-button primary"
                  aria-label="新建方式"
                  :aria-expanded="menu === 'new'"
                  @click="toggleMenu('new')"
                >
                  <ChevronDown :size="15" aria-hidden="true" />
                </button>
              </div>
              <div v-if="menu === 'new'" class="schedule-menu">
                <button type="button" @click="openScheduleConversation">
                  从对话新建
                </button>
                <button type="button" @click="navigate({ view: 'templates' })">
                  从模板新建
                </button>
              </div>
            </div>
          </template>

          <template v-else>
            <ScheduleSelect
              class="schedule-run-filter"
              label="运行状态"
              :model-value="runFilters.status || ''"
              :options="statusOptions"
              @update:model-value="updateFilters('status', $event)"
            />
            <ScheduleSelect
              v-model="runScope"
              class="schedule-run-filter"
              label="执行环境"
              :options="environmentOptions"
            />
            <ScheduleSelect
              class="schedule-run-filter schedule-task-filter"
              label="按任务筛选"
              search-label="搜索任务名称"
              :model-value="runFilters.schedule_id || ''"
              :options="taskOptions"
              @update:model-value="updateFilters('task', $event)"
            />
          </template>
        </div>

        <div
          v-else-if="view === 'detail' && currentTask"
          class="schedule-toolbar"
        >
          <IconButton
            class="schedule-tool-button"
            label="测试运行"
            :disabled="pending"
            @click="tryRun(currentTask)"
            ><Play :size="17"
          /></IconButton>
          <IconButton
            class="schedule-tool-button"
            label="查看该任务运行记录"
            @click="navigate({ view: 'runs', task: currentTask.id })"
            ><Clock :size="17"
          /></IconButton>
          <IconButton
            class="schedule-tool-button"
            label="编辑定时任务"
            @click="beginEditor(currentTask, currentTask.id)"
            ><Pencil :size="16"
          /></IconButton>
          <button
            type="button"
            class="schedule-switch"
            role="switch"
            :aria-label="`启用${currentTask.name}`"
            :aria-checked="currentTask.enabled"
            :disabled="pending"
            @click="toggleTask(currentTask)"
          >
            <span />
          </button>
          <IconButton
            class="schedule-tool-button"
            :label="showWorkspace ? '收起工作空间' : '打开工作空间'"
            :active="showWorkspace"
            :aria-expanded="showWorkspace"
            @click="showWorkspace = !showWorkspace"
            ><PanelRight :size="17"
          /></IconButton>
        </div>
      </header>

      <p v-if="actionError" class="schedule-alert error" role="alert">
        {{ actionError }}
      </p>
      <div
        v-if="tasksLoading && (view === 'tasks' || view === 'detail')"
        class="schedule-empty"
        aria-live="polite"
      >
        正在读取定时任务…
      </div>
      <div
        v-else-if="taskError && (view === 'tasks' || view === 'detail')"
        class="schedule-empty"
        role="alert"
      >
        <p>无法读取定时任务。{{ taskError }}</p>
        <button type="button" class="schedule-button" @click="loadTasks()">
          重试
        </button>
      </div>
      <template v-else-if="view === 'tasks'">
        <nav class="schedule-status-tabs" aria-label="任务状态">
          <button
            v-for="item in taskCounts"
            :key="item.key"
            type="button"
            :aria-current="taskStatus === item.key ? 'true' : undefined"
            @click="taskStatus = item.key"
          >
            {{ item.label }} <span>{{ item.count }}</span>
          </button>
        </nav>
        <div v-if="visibleTasks.length" class="schedule-cards">
          <article
            v-for="task in visibleTasks"
            :key="task.id"
            class="schedule-card"
            :class="{ selected: selected.has(task.id) }"
            :aria-label="task.name"
            @click="batch ? selectTask(task.id) : navigate({ detail: task.id })"
          >
            <div class="schedule-card-head">
              <input
                v-if="batch"
                type="checkbox"
                :aria-label="`选择${task.name}`"
                :checked="selected.has(task.id)"
                @click.stop
                @change="selectTask(task.id)"
              />
              <h2>
                <button
                  type="button"
                  @click.stop="
                    batch ? selectTask(task.id) : navigate({ detail: task.id })
                  "
                >
                  {{ task.name }}
                </button>
              </h2>
              <button
                v-if="!batch"
                type="button"
                class="schedule-switch"
                role="switch"
                :aria-label="`启用${task.name}`"
                :aria-checked="task.enabled"
                :disabled="pending"
                @click.stop="toggleTask(task)"
              >
                <span />
              </button>
            </div>
            <p class="schedule-card-description">{{ task.description }}</p>
            <div class="schedule-card-footer">
              <span
                ><CalendarClock :size="15" aria-hidden="true" />
                {{ ruleLabel(task.rule) }}</span
              ><span>{{ nextRunLabel(task) }}</span>
            </div>
          </article>
        </div>
        <div v-else class="schedule-empty">
          <h2>
            {{
              taskStatus === "paused" && !taskSearch
                ? "暂无已暂停任务"
                : "暂无符合条件的任务"
            }}
          </h2>
          <p>
            {{
              taskSearch
                ? "试试其他关键词。"
                : tasks.length
                  ? "切换状态查看其他任务。"
                  : "从对话或模板创建一个定时任务。"
            }}
          </p>
        </div>
        <footer v-if="batch" class="schedule-batch-bar">
          <div>
            <label class="schedule-check"
              ><input
                type="checkbox"
                :disabled="!visibleTasks.length"
                :checked="allSelected"
                @change="selectAll"
              />
              全选</label
            ><span aria-live="polite">已选中 {{ selected.size }} 项</span>
          </div>
          <button
            type="button"
            class="schedule-button danger"
            :disabled="!selected.size || pending"
            @click="deleteTasks"
          >
            删除
          </button>
        </footer>
      </template>

      <template v-else-if="view === 'runs'">
        <p v-if="runError" class="schedule-alert error" role="alert">
          无法读取运行记录。{{ runError }}
          <button
            type="button"
            class="schedule-button quiet"
            @click="loadRuns(true)"
          >
            重试
          </button>
        </p>
        <ScheduleRuns
          :runs="runs"
          :now="now"
          :pending="pending"
          :loading="runsLoading"
          @archive="archive"
          @remove="deleteRun"
        />
        <label class="schedule-check schedule-archive-filter"
          ><input
            type="checkbox"
            :checked="runFilters.archived === 'true'"
            @change="
              updateFilters(
                'archived',
                ($event.target as HTMLInputElement).checked
                  ? 'true'
                  : undefined,
              )
            "
          />
          查看已归档</label
        >
      </template>

      <div v-else-if="view === 'detail'" class="schedule-detail">
        <p v-if="notice" class="schedule-detail-notice" role="status">
          {{ notice }}
        </p>
        <p
          v-if="runError && currentTask"
          class="schedule-alert error"
          role="alert"
        >
          无法读取运行记录。{{ runError }}
          <button
            type="button"
            class="schedule-button quiet"
            @click="loadRuns(true)"
          >
            重试
          </button>
        </p>
        <ScheduleTimeline
          v-if="currentTask"
          :task="currentTask"
          :runs="runs"
          :now="now"
          :loading="runsLoading"
        />
        <div v-else class="schedule-empty">该任务已删除或不可用。</div>
      </div>

      <div v-else-if="view === 'templates'" class="schedule-templates">
        <button
          v-for="template in scheduleTemplates"
          :key="template.name"
          type="button"
          class="schedule-template"
          @click="beginEditor({ ...newSchedule(), ...template })"
        >
          <CalendarClock :size="19" aria-hidden="true" />
          <strong>{{ template.name }}</strong
          ><span>{{ template.description }}</span>
          <small>{{ ruleLabel(template.rule) }}</small>
        </button>
      </div>
    </div>

    <WorkspacePanel
      v-if="view === 'detail' && currentTask"
      :project-id="currentTask.project_id"
      :visible="showWorkspace"
      :revision="workspaceRevision"
      @close="showWorkspace = false"
    />

    <ScheduleEditor
      v-if="editor"
      :initial="editor.initial"
      :editing="Boolean(editor.id)"
      :saving="saving"
      :error="saveError"
      @close="editor = undefined"
      @save="save"
    />
    <DialogShell
      v-if="confirmation"
      :open="true"
      :label="confirmation.label"
      :width="420"
      @close="!pending && (confirmation = undefined)"
    >
      <div class="schedule-confirm">
        <header class="schedule-dialog-header">
          <h2>{{ confirmation.label }}</h2>
        </header>
        <div class="schedule-confirm-body">
          <p>{{ confirmation.message }}</p>
          <p v-if="confirmError" class="error" role="alert">
            {{ confirmError }}
          </p>
        </div>
        <footer class="schedule-dialog-footer">
          <button
            type="button"
            class="schedule-button quiet"
            :disabled="pending"
            @click="confirmation = undefined"
          >
            取消
          </button>
          <button
            type="button"
            class="schedule-button"
            :class="confirmation.danger ? 'danger' : 'primary'"
            :disabled="pending"
            @click="performConfirmed"
          >
            {{
              pending ? "处理中…" : confirmation.danger ? "删除" : "测试运行"
            }}
          </button>
        </footer>
      </div>
    </DialogShell>
  </section>
</template>

<style src="../styles/components/schedules.css"></style>
