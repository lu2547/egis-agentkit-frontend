<script setup lang="ts">
import { ref, computed, onMounted, onScopeDispose, watch } from "vue";
import BrandIdentity from "../components/common/BrandIdentity.vue";
import { useRuntimeOptions } from "../composables/useRuntimeOptions";
import { useRouter, useRoute } from "vue-router";
import ConversationTopbar from "../components/layout/ConversationTopbar.vue";
import TaskComposer from "../components/composer/TaskComposer.vue";
import ComposerProjectBar from "../components/composer/ComposerProjectBar.vue";
import PromptStarterList from "../components/composer/PromptStarterList.vue";
import WorkspacePanel from "../components/workspace/WorkspacePanel.vue";
import { manager } from "../api/manager";
import { errorText } from "../api/http";
import { useIdentity } from "../composables/useIdentity";
import { useAttachments } from "../composables/useAttachments";
import { queueDraft } from "../composables/usePendingDraft";
import type { Definition, Task } from "../types/api";
import { definitionName, definitionRef } from "../types/api";
const {
  assistant,
  models,
  defaultModelKey,
  projects,
  refreshTasks,
  refreshProjects,
} = useIdentity();
const runtime = useRuntimeOptions();
const permissionMode = ref("");
const router = useRouter(),
  route = useRoute();
const routeProjectId = computed(() =>
  typeof route.params.projectId === "string" ? route.params.projectId : "",
);
const selectedProjectId = ref("");
const projectId = computed(
  () =>
    selectedProjectId.value ||
    projects.value.find((project) => project.is_default)?.id ||
    "",
);
const text = ref(
    typeof route.query.prompt === "string" ? route.query.prompt : "",
  ),
  definitions = ref<Definition[]>([]),
  selected = ref<Definition | null>(null),
  pending = ref(false),
  error = ref(""),
  modelKey = ref("");
const requestedDefinition = typeof route.query.definition === "string" ? route.query.definition : "";
const resolvingDefinition = ref(!!requestedDefinition);
const definitionUnavailable = ref(false);
const attachments = useAttachments();
let uploadController = new AbortController();
onScopeDispose(() => uploadController.abort());
let preparedTask: { key: string; task: Task } | undefined;
const workspaceOpen = ref(false);
const fileRevision = ref(0);
watch(
  routeProjectId,
  (value) => {
    selectedProjectId.value = value;
    workspaceOpen.value = !!value;
    preparedTask = undefined;
    attachments.clear();
    fileRevision.value = 0;
    text.value =
      typeof route.query.prompt === "string" ? route.query.prompt : "";
  },
  { immediate: true },
);
watch(projectId, () => {
  uploadController.abort();
  uploadController = new AbortController();
  preparedTask = undefined;
  fileRevision.value = 0;
});
watch(projects, (items, previous) => {
  const selectedId = selectedProjectId.value;
  if (
    selectedId &&
    previous.some((project) => project.id === selectedId) &&
    !items.some((project) => project.id === selectedId)
  )
    selectedProjectId.value = "";
});
const homeSearch = ref("");
const effectiveModelKey = computed(
  () =>
    modelKey.value ||
    selected.value?.payload.model_key ||
    assistant.value?.payload.model_key ||
    defaultModelKey.value,
);
const prompts = computed(() =>
  selected.value
    ? selected.value.payload.starter_prompts.slice(0, 3)
    : ["梳理代码结构", "制定工作计划", "找一位专业帮手"],
);
function starter(value: string) {
  if (value === "找一位专业帮手") {
    void router.push("/experts");
    return;
  }
  text.value = value;
}
onMounted(async () => {
  void runtime.load().then(() => {
    permissionMode.value = runtime.defaultPermissionMode.value;
  });
  try {
    const [agents, teams] = await Promise.all([
      manager.definitions("agents"),
      manager.definitions("teams"),
    ]);
    definitions.value = [...agents.items, ...teams.items];
    if (requestedDefinition) {
      const catalogEntry = definitions.value.find(
        (d) => d.id === requestedDefinition &&
          (!route.query.view || d.resource_view_type === route.query.view),
      );
      const version = route.query.version;
      if (typeof version === "string") {
        const kind = route.query.kind || catalogEntry?.definition_type;
        const view = route.query.view || catalogEntry?.resource_view_type;
        if ((kind !== "agent" && kind !== "team") ||
            (view !== "private" && view !== "shared" && view !== "system"))
          throw new Error("无法读取选定的专家版本。");
        selected.value = await manager.definition(
          kind === "team" ? "teams" : "agents", requestedDefinition, view, version,
        );
      } else if (catalogEntry) {
        selected.value = catalogEntry;
      } else {
        throw new Error("无法读取选定的专家。");
      }
    }
  } catch (e) {
    definitionUnavailable.value = !!requestedDefinition;
    error.value = errorText(e);
  } finally {
    resolvingDefinition.value = false;
  }
});
function chooseDefinition(definition: Definition | null) {
  if (resolvingDefinition.value) return;
  selected.value = definition;
  if (definitionUnavailable.value) {
    definitionUnavailable.value = false;
    error.value = "";
  }
}
async function submit() {
  if (pending.value || resolvingDefinition.value || definitionUnavailable.value || !text.value.trim()) return;
  const definition = selected.value || assistant.value;
  if (!definition) {
    error.value = "个人助理尚未就绪，请刷新工作空间。";
    return;
  }
  if (!definition.is_usable) {
    error.value = "当前专家尚未获得使用授权。";
    return;
  }
  pending.value = true;
  error.value = "";
  const signal = uploadController.signal;
  try {
    const key = JSON.stringify([
      definition.id,
      definition.resource_view_type,
      definition.resource_version,
      modelKey.value,
      permissionMode.value,
      projectId.value,
    ]);
    const task =
      preparedTask?.key === key
        ? preparedTask.task
        : await manager.createTask(
            definitionRef(definition),
            modelKey.value || undefined,
            permissionMode.value,
            projectId.value || undefined,
          );
    signal.throwIfAborted();
    preparedTask = { key, task };
    const message = await attachments.upload(
      task.project_id,
      text.value.trim(),
      undefined,
      signal,
    );
    signal.throwIfAborted();
    queueDraft(task.session_id, message);
    await router.push(`/tasks/${encodeURIComponent(task.session_id)}`);
    if (router.currentRoute.value.params.sessionId !== task.session_id)
      throw new Error("对话已创建，但页面未能打开，请重试。");
    attachments.clear();
    void refreshTasks();
    void refreshProjects();
  } catch (e) {
    if (!signal.aborted) error.value = errorText(e);
  } finally {
    pending.value = false;
  }
}
</script>
<template>
  <div class="home-shell">
    <div class="home">
      <ConversationTopbar
        title="新建任务"
        is-new-task
        :project-id="projectId"
        :panel-open="workspaceOpen"
        :search-query="homeSearch"
        :match-count="0"
        :match-index="0"
        @toggle-panel="workspaceOpen = !workspaceOpen"
        @update:search-query="homeSearch = $event"
      />
      <div class="welcome">
        <BrandIdentity welcome />
        <h2>今天，想一起完成什么？</h2>
        <p>从一个想法开始，把工作交给养老险GPT。</p>
        <div v-if="selected" class="summoning">
          正在与 {{ definitionName(selected) }} 一起工作
        </div>
        <PromptStarterList :prompts="prompts" @select="starter" />
      </div>
      <div class="home-content">
        <div
          v-if="error || runtime.error.value"
          class="error home-error"
          role="alert"
        >
          {{ error || runtime.error.value }}
        </div>
        <TaskComposer
          :project-id="projectId"
          :file-revision="fileRevision"
          v-model="text"
          :models="models"
          :model-key="effectiveModelKey"
          :permission-mode="permissionMode"
          :permission-options="runtime.options.value"
          :settings-disabled="
            pending || runtime.loading.value || !!runtime.error.value
          "
          @update:model-key="modelKey = $event"
          @update:permission-mode="permissionMode = $event"
          :definitions="definitions"
          :selected="selected"
          :is-personal="!selected || selected.agent_type === 'personal'"
          :selected-label="
            selected
              ? undefined
              : assistant
                ? definitionName(assistant)
                : '个人助理'
          "
          :pending="pending"
          :disabled="runtime.loading.value || !!runtime.error.value || resolvingDefinition"
          :attachments="attachments.files.value"
          @attach="attachments.add"
          @remove-attachment="attachments.remove"
          @select="chooseDefinition"
          @submit="submit"
        >
          <template #footer>
            <ComposerProjectBar
              :project-id="projectId"
              :projects="projects"
              :disabled="pending"
              @select="selectedProjectId = $event"
            />
          </template>
        </TaskComposer>
      </div>
    </div>
    <WorkspacePanel
      :project-id="projectId || undefined"
      :revision="String(fileRevision)"
      :visible="workspaceOpen"
      @close="workspaceOpen = false"
      @uploaded="fileRevision++"
    />
  </div>
</template>
<style scoped src="../styles/components/home-view.css"></style>
