<script setup lang="ts">
import { usePreviewReferences } from "../composables/usePreviewReferences";
import type {
  ChatReference,
  PreviewReference,
  PreviewAcceptance,
} from "../domain/previewReferences";
import { ref, computed, onMounted, onScopeDispose, watch } from "vue";
import BrandIdentity from "../components/common/BrandIdentity.vue";
import { useRuntimeOptions } from "../composables/useRuntimeOptions";
import { useRouter, useRoute } from "vue-router";
import ConversationTopbar from "../components/layout/ConversationTopbar.vue";
import TaskComposer from "../components/composer/TaskComposer.vue";
import CollaboratorChips from "../components/conversation/CollaboratorChips.vue";
import ComposerProjectBar from "../components/composer/ComposerProjectBar.vue";
import PromptStarterList from "../components/composer/PromptStarterList.vue";
import WorkspacePanel from "../components/workspace/WorkspacePanel.vue";
import { manager } from "../api/manager";
import { errorText } from "../api/http";
import { useIdentity } from "../composables/useIdentity";
import { useAttachments } from "../composables/useAttachments";
import { queueDraft } from "../composables/usePendingDraft";
import type { Collaborator, Definition, Task } from "../types/api";
import { definitionName, definitionRef } from "../types/api";
import {
  expertInvitation,
  isInvitableExpert,
  sameExpert,
} from "../domain/expertInvitations";
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
  invitedExperts = ref<Definition[]>([]),
  pending = ref(false),
  error = ref(""),
  modelKey = ref("");
const requestedDefinition =
  typeof route.query.definition === "string" ? route.query.definition : "";
const resolvingDefinition = ref(!!requestedDefinition);
const definitionUnavailable = ref(false);
const references = usePreviewReferences(projectId);
const workspace = ref<InstanceType<typeof WorkspacePanel>>();
const composer = ref<InstanceType<typeof TaskComposer>>();
function openReference(value: ChatReference) {
  workspaceOpen.value = true;
  setTimeout(() => workspace.value?.openReference(value), 0);
}
function addReference(value: PreviewReference, accept: PreviewAcceptance) {
  const accepted = references.add(value);
  accept(accepted);
  if (accepted) composer.value?.focusComposer();
}
const attachments = useAttachments();
let uploadController = new AbortController();
onScopeDispose(() => uploadController.abort());
let preparedTask:
  | { key: string; task: Task; invitation?: { key: string; requestId: string } }
  | undefined;
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
    assistant.value?.payload.model_key ||
    defaultModelKey.value,
);
const defaultPrompts = ["梳理代码结构", "制定工作计划", "找一位专业帮手"];
const invitations = computed(() => invitedExperts.value.map(expertInvitation));
const prompts = computed(
  () =>
    invitedExperts.value[0]?.payload.starter_prompts.slice(0, 3) ??
    defaultPrompts,
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
    const agents = await manager.definitions("agents");
    definitions.value = agents.items;
    if (requestedDefinition) {
      if (route.query.kind === "team") throw new Error("专家团建设中");
      const catalogEntry = definitions.value.find(
        (d) =>
          d.id === requestedDefinition &&
          (!route.query.view || d.resource_view_type === route.query.view),
      );
      const version = route.query.version;
      let definition = catalogEntry;
      if (typeof version === "string") {
        const kind = route.query.kind || catalogEntry?.definition_type;
        const view = route.query.view || catalogEntry?.resource_view_type;
        if (
          kind !== "agent" ||
          (view !== "private" && view !== "shared" && view !== "system")
        )
          throw new Error("无法读取选定的专家版本。");
        definition = await manager.definition(
          "agents",
          requestedDefinition,
          view,
          version,
        );
      }
      if (!definition || !isInvitableExpert(definition))
        throw new Error("无法读取选定的专家。");
      addExpert(definition);
    }
  } catch (e) {
    definitionUnavailable.value = !!requestedDefinition;
    error.value = errorText(e);
  } finally {
    resolvingDefinition.value = false;
  }
});
function addExpert(definition: Definition) {
  if (!isInvitableExpert(definition)) return;
  const target = definitionRef(definition);
  const index = invitedExperts.value.findIndex((member) =>
    sameExpert(definitionRef(member), target),
  );
  if (index === -1) invitedExperts.value.push(definition);
  else invitedExperts.value[index] = definition;
  if (definitionUnavailable.value) {
    definitionUnavailable.value = false;
    error.value = "";
  }
}
function removeExpert(member: Collaborator) {
  invitedExperts.value = invitedExperts.value.filter(
    (definition) => !sameExpert(definitionRef(definition), member),
  );
}
async function submit() {
  if (
    pending.value ||
    resolvingDefinition.value ||
    definitionUnavailable.value ||
    (!text.value.trim() && !references.items.value.length)
  )
    return;
  const definition = assistant.value;
  if (!definition) {
    error.value = "个人助理尚未就绪，请刷新工作空间。";
    return;
  }
  if (!definition.is_usable) {
    error.value = "个人助理尚未获得使用授权。";
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
    const preparation =
      preparedTask?.key === key
        ? preparedTask
        : {
            key,
            task: await manager.createTask(
              definitionRef(definition),
              modelKey.value || undefined,
              permissionMode.value,
              projectId.value || undefined,
            ),
          };
    signal.throwIfAborted();
    preparedTask = preparation;
    const { task } = preparation;
    references.validate();
    const message = await attachments.upload(
      task.project_id,
      text.value.trim(),
      undefined,
      signal,
    );
    signal.throwIfAborted();
    const experts = invitedExperts.value.map(definitionRef);
    if (experts.length || preparation.invitation) {
      const invitationKey = JSON.stringify(experts);
      if (preparation.invitation?.key !== invitationKey)
        preparation.invitation = {
          key: invitationKey,
          requestId: crypto.randomUUID(),
        };
      await manager.prepareCollaborators(
        task.session_id,
        preparation.invitation.requestId,
        experts,
        signal,
      );
      signal.throwIfAborted();
    }
    queueDraft(task.session_id, message, [...references.items.value]);
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
          ref="composer"
          :references="references.items.value"
          :reference-error="references.error.value"
          @add-file-reference="references.add"
          @remove-reference="references.remove"
          @open-reference="openReference"
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
          can-invite-experts
          is-personal
          :selected-label="assistant ? definitionName(assistant) : '个人助理'"
          :pending="pending"
          :disabled="
            runtime.loading.value ||
            !!runtime.error.value ||
            resolvingDefinition
          "
          :attachments="attachments.files.value"
          @attach="attachments.add"
          @remove-attachment="attachments.remove"
          @select="addExpert"
          @submit="submit"
        >
          <template #collaborators>
            <CollaboratorChips
              :members="invitations"
              :disabled="pending || resolvingDefinition"
              @remove="removeExpert"
            />
          </template>
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
      ref="workspace"
      @reference="addReference"
      :project-id="projectId || undefined"
      :revision="String(fileRevision)"
      :visible="workspaceOpen"
      @close="workspaceOpen = false"
      @uploaded="fileRevision++"
    />
  </div>
</template>
<style scoped src="../styles/components/home-view.css"></style>
