<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import BrandIdentity from "../components/common/BrandIdentity.vue";
import { useRuntimeOptions } from "../composables/useRuntimeOptions";
import { useRouter, useRoute } from "vue-router";
import ConversationTopbar from "../components/layout/ConversationTopbar.vue";
import TaskComposer from "../components/composer/TaskComposer.vue";
import PromptStarterList from "../components/composer/PromptStarterList.vue";
import WorkspacePanel from "../components/workspace/WorkspacePanel.vue";
import { manager } from "../api/manager";
import { errorText } from "../api/http";
import { useIdentity } from "../composables/useIdentity";
import { useAttachments } from "../composables/useAttachments";
import { queueDraft } from "../composables/usePendingDraft";
import type { Definition, Task } from "../types/api";
import { definitionName } from "../types/api";
const {
  assistant,
  models,
  defaultModelKey,
  projects,
  tasks,
  refreshTasks,
  refreshProjects,
} = useIdentity();
const runtime = useRuntimeOptions();
const permissionMode = ref("default");
const router = useRouter(),
  route = useRoute();
const projectId = computed(() =>
  typeof route.params.projectId === "string" ? route.params.projectId : "",
);
const project = computed(() =>
  projects.value.find((item) => item.id === projectId.value),
);
const projectTasks = computed(() =>
  tasks.value.filter((task) => task.project_id === projectId.value),
);
const text = ref(
    typeof route.query.prompt === "string" ? route.query.prompt : "",
  ),
  definitions = ref<Definition[]>([]),
  selected = ref<Definition | null>(null),
  pending = ref(false),
  error = ref(""),
  modelKey = ref("");
const attachments = useAttachments();
let preparedTask: { key: string; task: Task } | undefined;
const workspaceOpen = ref(false);
const fileRevision = ref(0);
watch(
  projectId,
  (value) => {
    workspaceOpen.value = !!value;
    preparedTask = undefined;
    attachments.clear();
    fileRevision.value = 0;
    text.value =
      typeof route.query.prompt === "string" ? route.query.prompt : "";
  },
  { immediate: true },
);
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
    if (route.query.definition)
      selected.value =
        definitions.value.find(
          (d) =>
            d.id === route.query.definition &&
            (!route.query.view || d.resource_view_type === route.query.view),
        ) || null;
  } catch (e) {
    error.value = errorText(e);
  }
});
async function submit() {
  if (pending.value || !text.value.trim()) return;
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
  try {
    const key = JSON.stringify([
      definition.id,
      definition.resource_view_type,
      modelKey.value,
      permissionMode.value,
      projectId.value,
    ]);
    const task =
      preparedTask?.key === key
        ? preparedTask.task
        : await manager.createTask(
            {
              definition_id: definition.id,
              resource_view_type: definition.resource_view_type,
            },
            modelKey.value || undefined,
            permissionMode.value,
            projectId.value || undefined,
          );
    preparedTask = { key, task };
    const message = await attachments.upload(
      task.session_id,
      text.value.trim(),
      undefined,
      undefined,
      task.project_id,
    );
    queueDraft(task.session_id, message);
    await router.push(`/tasks/${encodeURIComponent(task.session_id)}`);
    if (router.currentRoute.value.params.sessionId !== task.session_id)
      throw new Error("对话已创建，但页面未能打开，请重试。");
    attachments.clear();
    void refreshTasks();
    void refreshProjects();
  } catch (e) {
    error.value = errorText(e);
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
        <BrandIdentity v-if="!projectId" welcome />
        <h2>
          {{
            projectId
              ? project?.project_name || "项目"
              : "今天，想一起完成什么？"
          }}
        </h2>
        <p>
          {{
            projectId
              ? "在项目中开始新对话，所有对话共享右侧工作空间。"
              : "从一个想法开始，把工作交给养老险GPT。"
          }}
        </p>
        <div v-if="selected" class="summoning">
          正在与 {{ definitionName(selected) }} 一起工作
        </div>
        <PromptStarterList :prompts="prompts" @select="starter" />
        <div
          v-if="projectId && projectTasks.length"
          class="project-conversations"
          aria-label="项目对话"
        >
          <RouterLink
            v-for="task in projectTasks"
            :key="task.session_id"
            :to="`/tasks/${encodeURIComponent(task.session_id)}`"
            >{{ task.name }}<span aria-hidden="true">›</span></RouterLink
          >
        </div>
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
          :disabled="runtime.loading.value || !!runtime.error.value"
          :attachments="attachments.files.value"
          @attach="attachments.add"
          @remove-attachment="attachments.remove"
          @select="selected = $event"
          @submit="submit"
        />
      </div>
    </div>
    <WorkspacePanel
      :session-id="''"
      :project-id="projectId || undefined"
      :revision="String(fileRevision)"
      :visible="workspaceOpen"
      @close="workspaceOpen = false"
      @uploaded="fileRevision++"
    />
  </div>
</template>
<style scoped src="../styles/components/home-view.css"></style>
