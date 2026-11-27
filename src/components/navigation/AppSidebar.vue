<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { CalendarClock } from "lucide-vue-next";
import { useTaskActivity } from "../../composables/useTaskActivity";
import { useRoute, useRouter } from "vue-router";
import { useIdentity } from "../../composables/useIdentity";
import { useTheme } from "../../composables/useTheme";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";
import { workspaceScopeId } from "../../domain/workspaceView";
import type { Task, Project } from "../../types/api";
import SidebarTaskRow from "./SidebarTaskRow.vue";
import BrandIdentity from "../common/BrandIdentity.vue";
import AppIcon from "../common/AppIcon.vue";
import IconButton from "../common/IconButton.vue";
import DialogShell from "../common/DialogShell.vue";
defineProps<{ collapsed: boolean }>();
const emit = defineEmits<{ navigate: []; collapse: []; search: [] }>();
const {
  user,
  isAdmin,
  tasks,
  projects,
  refreshTasks,
  refreshProjects,
  logout,
} = useIdentity();
const taskActivity = useTaskActivity();
const activity = taskActivity.activity;
let activityTimer: ReturnType<typeof setInterval> | undefined;
const { theme, toggle } = useTheme();
const userInitial = computed(
  () =>
    Array.from(
      user.value?.username?.trim() || user.value?.user_id || "用户",
    )[0],
);
const route = useRoute(),
  router = useRouter();
watch(
  () => route.params.sessionId,
  (value) => taskActivity.activate(typeof value === "string" ? value : ""),
  { immediate: true },
);
const root = ref<HTMLElement>(),
  menu = ref<"account" | "more" | null>(null),
  selectedTask = ref<Task | null>(null);
const selectedProject = ref<Project | null>(null);
const expandedProjects = ref(new Set<string>());
const expandedSessionLists = ref(new Set<string>());
const PROJECT_SESSION_PREVIEW_LIMIT = 10;
const currentProjectId = computed(() =>
  String(
    route.params.projectId ||
      tasks.value.find((task) => task.session_id === route.params.sessionId)
        ?.project_id ||
      "",
  ),
);
const projectIds = computed(
  () => new Set(projects.value.map((project) => project.id)),
);
const recentTasks = computed(() =>
  tasks.value.filter((task) => !projectIds.value.has(task.project_id)),
);
watch(
  projects,
  (items, previous) => {
    const existing = new Set(previous?.map((item) => item.id));
    const next = new Set(expandedProjects.value);
    items.forEach((item) => {
      if (!existing.has(item.id)) next.add(item.id);
    });
    expandedProjects.value = next;
  },
  { immediate: true },
);
watch(
  [currentProjectId, () => route.params.sessionId],
  ([projectId, sessionId]) => {
    // 进入会话时展开所属项目；项目行自己控制折叠，切项目不能反向覆盖点击结果。
    if (projectId && sessionId)
      expandedProjects.value = new Set([...expandedProjects.value, projectId]);
  },
);
function toggleProject(projectId: string) {
  const next = new Set(expandedProjects.value);
  next.has(projectId) ? next.delete(projectId) : next.add(projectId);
  expandedProjects.value = next;
}
/** 项目行的图标、名称和空白区域共用入口；新增和菜单保持各自操作。 */
function selectProject(projectId: string) {
  toggleProject(projectId);
  navigate(`/projects/${encodeURIComponent(projectId)}`);
}
function projectSessions(projectId: string) {
  return tasks.value.filter((task) => task.project_id === projectId);
}
/** 保留最近对话及当前对话；每个项目独立展开更多历史。 */
function visibleProjectSessions(projectId: string) {
  const sessions = projectSessions(projectId);
  if (expandedSessionLists.value.has(projectId)) return sessions;
  return sessions.filter(
    (task, index) =>
      index < PROJECT_SESSION_PREVIEW_LIMIT ||
      task.session_id === route.params.sessionId,
  );
}
function toggleSessionList(projectId: string) {
  const next = new Set(expandedSessionLists.value);
  next.has(projectId) ? next.delete(projectId) : next.add(projectId);
  expandedSessionLists.value = next;
}
function beginProject(kind: "create" | "rename" | "remove", project?: Project) {
  selectedTask.value = null;
  selectedProject.value = project || null;
  action.value = kind;
  draft.value = project?.project_name || "";
  error.value = "";
}
const action = ref<"create" | "rename" | "remove" | null>(null),
  draft = ref(""),
  pending = ref(false),
  error = ref("");
const isCatalog = computed(() =>
  ["/experts", "/skills", "/connectors", "/tools"].some((path) =>
    route.path.startsWith(path),
  ),
);
const sections = [
  { to: "/experts?tab=personal", icon: "personal", label: "个人助理" },
  { to: "/experts?tab=agent", icon: "experts", label: "专家" },
  { icon: "team", label: "专家团" },
  { to: "/skills", icon: "skill", label: "技能" },
  { to: "/connectors", icon: "connector", label: "连接器" },
  { to: "/tools", icon: "grid", label: "工具" },
];
const catalogMenu = ref(false);
function navigate(to: string) {
  menu.value = null;
  selectedTask.value = null;
  catalogMenu.value = false;
  void router.push(to);
  emit("navigate");
}
function begin(kind: "rename" | "remove", task: Task) {
  selectedProject.value = null;
  selectedTask.value = task;
  action.value = kind;
  draft.value = task.name;
  error.value = "";
}
function close() {
  if (!pending.value) {
    action.value = null;
    selectedTask.value = null;
    selectedProject.value = null;
  }
}
async function save() {
  const task = selectedTask.value,
    project = selectedProject.value;
  const isProject = !!project || action.value === "create";
  if (pending.value || (!task && !isProject)) return;
  if (action.value !== "remove" && !draft.value.trim()) {
    error.value = isProject ? "请输入项目名称" : "请输入对话名称";
    return;
  }
  pending.value = true;
  error.value = "";
  try {
    if (action.value === "create") {
      const created = await manager.createProject(draft.value.trim());
      projects.value = [created, ...projects.value];
      navigate(`/projects/${encodeURIComponent(created.id)}`);
    } else if (project) {
      if (action.value === "rename") {
        const renamed = await manager.renameProject(
          project.id,
          draft.value.trim(),
        );
        projects.value = projects.value.map((item) =>
          item.id === project.id ? renamed : item,
        );
      } else {
        await manager.deleteProject(project.id);
        projectSessions(project.id).forEach((item) =>
          taskActivity.forget(item.session_id),
        );
        const wasCurrent = currentProjectId.value === project.id;
        tasks.value = tasks.value.filter(
          (item) => item.project_id !== project.id,
        );
        projects.value = projects.value.filter(
          (item) => item.id !== project.id,
        );
        if (user.value) {
          const prefix = `egis_workspace_tabs:${user.value.user_id}:project:${project.id}:`;
          Object.keys(sessionStorage)
            .filter((key) => key.startsWith(prefix))
            .forEach((key) => sessionStorage.removeItem(key));
        }
        if (wasCurrent) await router.push("/");
      }
    } else if (task) {
      if (action.value === "rename") {
        const renamed = await manager.renameTask(
          task.session_id,
          draft.value.trim(),
        );
        tasks.value = tasks.value.map((item) =>
          item.session_id === task.session_id ? renamed : item,
        );
        window.dispatchEvent(
          new CustomEvent("agentkit:task-renamed", { detail: renamed }),
        );
      } else {
        await manager.deleteTask(task.session_id);
        if (user.value)
          sessionStorage.removeItem(
            `egis_workspace_tabs:${user.value.user_id}:${workspaceScopeId(task.project_id, task.session_id)}`,
          );
        taskActivity.forget(task.session_id);
        tasks.value = tasks.value.filter(
          (item) => item.session_id !== task.session_id,
        );
        if (route.params.sessionId === task.session_id)
          await router.push(
            task.project_id
              ? `/projects/${encodeURIComponent(task.project_id)}`
              : "/",
          );
      }
    }
    action.value = null;
    selectedTask.value = null;
    selectedProject.value = null;
    void refreshTasks();
    void refreshProjects();
  } catch (e) {
    error.value = errorText(e);
  } finally {
    pending.value = false;
  }
}
function outside(e: PointerEvent) {
  if (e.target instanceof Node && !root.value?.contains(e.target)) {
    menu.value = null;
    if (!action.value) selectedTask.value = null;
    catalogMenu.value = false;
  }
}
function escape(e: KeyboardEvent) {
  if (e.key === "Escape") {
    menu.value = null;
    catalogMenu.value = false;
    if (!action.value) selectedTask.value = null;
  }
}
onMounted(() => {
  activityTimer = setInterval(() => {
    if (!document.hidden && user.value) void refreshTasks();
  }, 5000);
  document.addEventListener("pointerdown", outside);
  document.addEventListener("keydown", escape);
});
onBeforeUnmount(() => {
  clearInterval(activityTimer);
  document.removeEventListener("pointerdown", outside);
  document.removeEventListener("keydown", escape);
});
</script>
<template>
  <aside
    ref="root"
    class="app-sidebar sidebar"
    :class="{ collapsed }"
    aria-label="主导航"
  >
    <header class="sidebar-header">
      <RouterLink
        class="brand"
        to="/"
        aria-label="养老险GPT"
        @click="$emit('navigate')"
        ><BrandIdentity :compact="collapsed"
      /></RouterLink>
      <div v-if="!collapsed" class="header-actions">
        <IconButton label="收起导航" @click="$emit('collapse')"
          ><AppIcon name="panel" /></IconButton
        ><IconButton label="全局搜索" @click="$emit('search')"
          ><AppIcon name="search"
        /></IconButton>
      </div>
    </header>
    <nav class="primary-nav" aria-label="工作空间">
      <RouterLink
        class="nav-item new-task"
        :to="
          currentProjectId
            ? `/projects/${encodeURIComponent(currentProjectId)}`
            : '/'
        "
        @click="$emit('navigate')"
        ><AppIcon name="new" /><span v-if="!collapsed"
          >新建任务</span
        ></RouterLink
      >
      <div
        class="capability-entry"
        @mouseenter="catalogMenu = true"
        @mouseleave="catalogMenu = false"
      >
        <button
          class="nav-item"
          :class="{ active: isCatalog }"
          :aria-expanded="catalogMenu"
          @click="navigate('/experts')"
        >
          <AppIcon name="experts" /><span v-if="!collapsed"
            >专家·技能·连接器</span
          >
        </button>
        <div v-if="catalogMenu && !collapsed" class="popover capability-menu">
          <button
            v-for="section in sections"
            :key="section.icon"
            :disabled="!section.to"
            @click="section.to && navigate(section.to)"
          >
            <AppIcon :name="section.icon" :size="18" />{{ section.label }}
            <small v-if="!section.to" class="capability-status">建设中</small>
          </button>
        </div>
      </div>
      <button class="nav-item" disabled :title="collapsed ? '知识库' : undefined">
        <AppIcon name="book" /><span v-if="!collapsed">知识库</span>
      </button>
      <RouterLink
        class="nav-item"
        active-class="active"
        to="/schedules"
        aria-label="定时任务"
        :title="collapsed ? '定时任务' : undefined"
        @click="$emit('navigate')"
      ><CalendarClock :size="19" aria-hidden="true" /><span v-if="!collapsed">定时任务</span></RouterLink>
      <div class="more-wrap">
        <button
          class="nav-item"
          :aria-expanded="menu === 'more'"
          @click="menu = menu === 'more' ? null : 'more'"
        >
          <AppIcon name="grid" /><span v-if="!collapsed">更多</span>
        </button>
        <div v-if="menu === 'more'" class="popover more-menu">
          <button @click="navigate('/share-requests')">
            <AppIcon name="experts" :size="16" />共享申请</button
          ><button v-if="isAdmin" @click="navigate('/admin/users')">
            <AppIcon name="shield" :size="16" />管理
          </button>
        </div>
      </div>
    </nav>
    <div v-if="!collapsed" class="sidebar-conversations">
      <section class="projects-section" aria-label="项目">
        <div class="section-heading">
          <h2>项目</h2>
          <IconButton
            class="project-create"
            label="新建项目"
            @click="beginProject('create')"
            ><AppIcon name="plus" :size="16"
          /></IconButton>
        </div>
        <div
          v-for="project in projects"
          :key="project.id"
          class="project-group"
        >
          <div
            class="project-row"
            :class="{ active: route.params.projectId === project.id }"
            @click.self="selectProject(project.id)"
          >
            <button
              class="project-toggle"
              :aria-label="`${expandedProjects.has(project.id) ? '收起' : '展开'}项目：${project.project_name}`"
              :aria-expanded="expandedProjects.has(project.id)"
              @click="selectProject(project.id)"
            >
              <AppIcon
                :name="
                  expandedProjects.has(project.id) ? 'folder-open' : 'folder'
                "
                :size="19"
              />
            </button>
            <button
              class="project-select"
              :aria-label="`打开项目：${project.project_name}`"
              @click="selectProject(project.id)"
            >
              <span>{{ project.project_name }}</span>
            </button>
            <button
              class="project-add"
              :aria-label="`在${project.project_name}中新建对话`"
              @click="navigate(`/projects/${encodeURIComponent(project.id)}`)"
            >
              <AppIcon name="plus" :size="16" />
            </button>
            <t-popup trigger="click" placement="bottom-right"
              ><button
                class="project-more"
                :aria-label="`${project.project_name}的项目操作`"
              >
                <AppIcon name="more" :size="16" /></button
              ><template #content
                ><div class="conversation-actions">
                  <button @click="beginProject('rename', project)">
                    <AppIcon name="edit" :size="15" />重命名项目</button
                  ><button
                    v-if="!project.is_default"
                    class="danger-text"
                    :aria-label="`删除项目：${project.project_name}`"
                    @click="beginProject('remove', project)"
                  >
                    <AppIcon name="trash" :size="15" />删除项目
                  </button>
                </div></template
              ></t-popup
            >
          </div>
          <div
            v-if="expandedProjects.has(project.id)"
            :id="`project-sessions-${project.id}`"
            class="project-sessions"
          >
            <SidebarTaskRow
              v-for="task in visibleProjectSessions(project.id)"
              :key="task.session_id"
              :task="task"
              :active="route.params.sessionId === task.session_id"
              :activity="activity[task.session_id]"
              @navigate="$emit('navigate')"
              @rename="begin('rename', $event)"
              @remove="begin('remove', $event)"
            />
            <button
              v-if="
                projectSessions(project.id).length >
                PROJECT_SESSION_PREVIEW_LIMIT
              "
              class="project-sessions-toggle"
              :aria-expanded="expandedSessionLists.has(project.id)"
              :aria-controls="`project-sessions-${project.id}`"
              @click="toggleSessionList(project.id)"
            >
              {{
                expandedSessionLists.has(project.id) ? "收起显示" : "展开显示"
              }}
            </button>
            <p v-if="!projectSessions(project.id).length" class="project-empty">
              暂无对话
            </p>
          </div>
        </div>
        <button
          v-if="!projects.length"
          class="empty-projects"
          @click="beginProject('create')"
        >
          创建项目，整理对话与文件
        </button>
      </section>
      <section
        v-if="recentTasks.length"
        class="recent-section"
        aria-label="最近对话"
      >
        <h2>最近对话</h2>
        <div class="conversation-list">
          <SidebarTaskRow
            v-for="task in recentTasks"
            :key="task.session_id"
            :task="task"
            :active="route.params.sessionId === task.session_id"
            :activity="activity[task.session_id]"
            @navigate="$emit('navigate')"
            @rename="begin('rename', $event)"
            @remove="begin('remove', $event)"
          />
          <p v-if="!recentTasks.length" class="no-conversations">
            从新建任务开始第一段对话
          </p>
        </div>
      </section>
    </div>
    <footer class="sidebar-footer">
      <button
        class="account-button"
        aria-label="账户菜单"
        :aria-expanded="menu === 'account'"
        @click="menu = menu === 'account' ? null : 'account'"
      >
        <span class="account-avatar" aria-hidden="true">{{ userInitial }}</span
        ><span v-if="!collapsed" class="account-copy"
          ><strong>{{ user?.username }}</strong
          ><small>{{ isAdmin ? "管理员用户" : "普通用户" }}</small></span
        >
      </button>
      <IconButton
        v-if="!collapsed"
        :label="theme === 'dark' ? '切换浅色模式' : '切换深色模式'"
        @click="toggle"
        ><AppIcon :name="theme === 'dark' ? 'sun' : 'moon'"
      /></IconButton>
      <div v-if="menu === 'account'" class="popover account-menu">
        <button @click="toggle">
          <AppIcon :name="theme === 'dark' ? 'sun' : 'moon'" :size="16" />{{
            theme === "dark" ? "浅色模式" : "深色模式"
          }}</button
        ><button @click="navigate('/share-requests')">
          <AppIcon name="experts" :size="16" />共享申请</button
        ><button v-if="isAdmin" @click="navigate('/admin/users')">
          <AppIcon name="shield" :size="16" />管理</button
        ><button @click="logout">
          <AppIcon name="logout" :size="16" />退出登录
        </button>
      </div>
    </footer>
    <DialogShell
      :open="!!action"
      :label="
        action === 'create'
          ? '新建项目'
          : selectedProject
            ? action === 'rename'
              ? '重命名项目'
              : '删除项目'
            : action === 'rename'
              ? '重命名对话'
              : '删除对话'
      "
      :width="420"
      @close="close"
      ><form class="conversation-dialog" @submit.prevent="save">
        <h2>
          {{
            action === "create"
              ? "新建项目"
              : selectedProject
                ? action === "rename"
                  ? "重命名项目"
                  : "删除这个项目？"
                : action === "rename"
                  ? "重命名对话"
                  : "删除这条对话？"
          }}
        </h2>
        <label v-if="action !== 'remove'"
          >{{ selectedProject || action === "create" ? "项目名称" : "对话名称"
          }}<input
            v-model="draft"
            autofocus
            :aria-label="
              selectedProject || action === 'create' ? '项目名称' : '对话名称'
            "
            maxlength="80"
            :disabled="pending"
        /></label>
        <p v-else-if="selectedProject">
          删除「{{
            selectedProject.project_name
          }}」会同时删除项目中的所有对话、上传资料、过程文件、产物和变更记录，无法恢复。
        </p>
        <p v-else>
          删除「{{
            selectedTask?.name
          }}」只会删除这条对话。项目中的上传资料、过程文件、产物和变更记录都会保留，可在其他对话中继续使用。
        </p>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <footer>
          <button type="button" :disabled="pending" @click="close">取消</button
          ><button
            type="submit"
            :class="action === 'remove' ? 'delete-button' : 'primary-button'"
            :disabled="pending"
          >
            {{
              pending
                ? "保存中…"
                : action === "create"
                  ? "创建项目"
                  : action === "rename"
                    ? "保存"
                    : selectedProject
                      ? "删除项目"
                      : "删除对话"
            }}
          </button>
        </footer>
      </form></DialogShell
    >
  </aside>
</template>
<style scoped src="../../styles/components/AppSidebar.css"></style>
