<script setup lang="ts">
import { ref, watch, computed, nextTick, onScopeDispose } from "vue";
import { useRoute } from "vue-router";
import { manager } from "../api/manager";
import type { Definition, Collaborator } from "../types/api";
import { definitionName } from "../types/api";
import CollaboratorChips from "../components/conversation/CollaboratorChips.vue";
import ConversationTopbar from "../components/layout/ConversationTopbar.vue";
import { useRuntimeOptions } from "../composables/useRuntimeOptions";
import { useConversation } from "../composables/useConversation";
import { useIdentity } from "../composables/useIdentity";
import { useAttachments } from "../composables/useAttachments";
import { errorText } from "../api/http";
import type { ReplyArtifact } from "../types/api";
import { groupReplyArtifacts } from "../domain/replyArtifacts";
import { peekDraft, takeDraft } from "../composables/usePendingDraft";
import TaskComposer from "../components/composer/TaskComposer.vue";
import ComposerProjectBar from "../components/composer/ComposerProjectBar.vue";
import PermissionRequestCard from "../components/conversation/PermissionRequestCard.vue";
import MessageList from "../components/conversation/MessageList.vue";
import ArtifactList from "../components/workspace/ArtifactList.vue";
import WorkspacePanel from "../components/workspace/WorkspacePanel.vue";
const route = useRoute(),
  conversation = useConversation(),
  { refreshTasks, tasks, projects, assistant, models, defaultModelKey } =
    useIdentity();
const runtime = useRuntimeOptions();
void runtime.load();
const settingsPending = conversation.settingsPending;
const stagedExperts = ref<Collaborator[]>([]);
const invitationDirty = ref(false);
let invitationRequestId = "";
const sameExpert = (
  a: Collaborator,
  b: { definition_id: string; resource_view_type: string },
) =>
  a.definition_id === b.definition_id &&
  a.resource_view_type === b.resource_view_type;
const pendingExperts = computed(() =>
  invitationDirty.value
    ? stagedExperts.value
    : (conversation.task.value?.collaborators || []).filter(
        (member) => member.status === "pending",
      ),
);
const collaborationChips = computed(() => [
  ...(conversation.task.value?.collaborators || []).filter(
    (member) =>
      member.status === "joined" &&
      !pendingExperts.value.some((item) => sameExpert(item, member)),
  ),
  ...pendingExperts.value,
]);
watch(
  () => conversation.task.value,
  (task) => {
    if (
      !task ||
      task.session_id !== String(route.params.sessionId || "") ||
      invitationDirty.value
    )
      return;
    stagedExperts.value = (task.collaborators || []).filter(
      (member) => member.status === "pending",
    );
    invitationRequestId = task.pending_collaboration_request_id || "";
  },
);
function selectExpert(definition: Definition | null) {
  if (!definition || uploading.value || conversation.submitting.value) return;
  if (
    !conversation.task.value?.collaboration_allowed ||
    definition.agent_type !== "expert"
  ) {
    conversation.error.value =
      "仅个人助理对话可以邀请专家协作，固定专家团成员不在这里调整。";
    return;
  }
  const target: Collaborator = {
    definition_id: definition.id,
    resource_view_type: definition.resource_view_type,
    display_name: definitionName(definition),
    status: "pending",
    avatar: definition.payload.avatar,
  };
  if (pendingExperts.value.some((item) => sameExpert(item, target))) return;
  if (pendingExperts.value.length >= 16) {
    conversation.error.value = "本次最多选择 16 位协作专家。";
    return;
  }
  stagedExperts.value = [...pendingExperts.value, target];
  invitationDirty.value = true;
  invitationRequestId = "";
}
function removeExpert(member: Collaborator) {
  stagedExperts.value = pendingExperts.value.filter(
    (item) => !sameExpert(item, member),
  );
  invitationDirty.value = true;
  invitationRequestId = "";
}
const text = ref(""),
  workspaceOpen = ref(window.innerWidth >= 1100),
  workspace = ref<InstanceType<typeof WorkspacePanel> | null>(null);
const sid = computed(() => String(route.params.sessionId || ""));
const projectId = computed(
  () =>
    conversation.task.value?.project_id ||
    tasks.value.find((task) => task.session_id === sid.value)?.project_id,
);
const project = computed(() =>
  projects.value.find((item) => item.id === projectId.value),
);
const attachments = useAttachments(),
  uploading = ref(false),
  fileRevision = ref(0);
let attachmentController = new AbortController();
onScopeDispose(() => attachmentController.abort());
let generation = 0;
watch(
  sid,
  async (value) => {
    const current = ++generation;
    attachmentController.abort();
    attachmentController = new AbortController();
    fileRevision.value = 0;
    text.value = "";
    stagedExperts.value = [];
    invitationDirty.value = false;
    invitationRequestId = "";
    attachments.clear();
    uploading.value = false;
    await conversation.open(value);
    if (
      generation !== current ||
      sid.value !== value ||
      conversation.task.value?.session_id !== value
    )
      return;
    const draft = peekDraft(value);
    if (draft) {
      if (await conversation.send(draft)) takeDraft(value);
      else if (generation === current && sid.value === value && !text.value)
        text.value = draft;
    }
  },
  { immediate: true },
);
watch(
  () => conversation.state.value.phase,
  (phase) => {
    if (phase === "idle") {
      void refreshTasks();
      void conversation.refreshMetadata();
    }
  },
);
async function attach(files: File[]) {
  if (!conversation.task.value || conversation.loading.value) return;
  const current = generation,
    targetSid = sid.value;
  attachments.add(files);
  uploading.value = true;
  conversation.error.value = "";
  try {
    await attachments.ensureUploaded(
      targetSid,
      files,
      attachmentController.signal,
      projectId.value,
    );
    if (generation === current && sid.value === targetSid) fileRevision.value++;
  } catch (error) {
    if (generation === current && sid.value === targetSid)
      conversation.error.value = errorText(error);
  } finally {
    if (generation === current && sid.value === targetSid)
      uploading.value = false;
  }
}
async function send() {
  const value = text.value.trim();
  if (
    !value ||
    !conversation.task.value ||
    uploading.value ||
    conversation.submitting.value ||
    conversation.state.value.phase !== "idle"
  )
    return;
  const current = generation,
    targetSid = sid.value,
    selectedFiles = [...attachments.files.value];
  uploading.value = true;
  try {
    const message = await attachments.upload(
      targetSid,
      value,
      selectedFiles,
      attachmentController.signal,
      projectId.value,
    );
    if (generation !== current || sid.value !== targetSid) return;
    fileRevision.value++;
    if (invitationDirty.value || pendingExperts.value.length) {
      invitationRequestId ||=
        (!invitationDirty.value &&
          conversation.task.value?.pending_collaboration_request_id) ||
        crypto.randomUUID();
      const prepared = await manager.prepareCollaborators(
        targetSid,
        invitationRequestId,
        pendingExperts.value.map((member) => ({
          definition_id: member.definition_id,
          resource_view_type: member.resource_view_type,
        })),
      );
      if (generation !== current || sid.value !== targetSid) return;
      conversation.task.value = { ...conversation.task.value!, ...prepared };
    }
    const accepted = await conversation.send(message);
    if (accepted) takeDraft(targetSid);
    if (accepted && generation === current && sid.value === targetSid) {
      if (text.value.trim() === value) text.value = "";
      attachments.removeUploaded(selectedFiles);
      stagedExperts.value = [];
      invitationDirty.value = false;
      invitationRequestId = "";
    }
  } catch (e) {
    if (generation === current && sid.value === targetSid)
      conversation.error.value = errorText(e);
  } finally {
    if (generation === current && sid.value === targetSid)
      uploading.value = false;
  }
}
function showArtifacts() {
  workspaceOpen.value = true;
  setTimeout(() => workspace.value?.openTab("artifacts"), 0);
}
function openFile(path: string, area = "artifacts") {
  workspaceOpen.value = true;
  setTimeout(() => workspace.value?.openFile(path, area), 0);
}
const searchQuery = ref("");
const matchIndex = ref(0);
const matchCount = ref(0);
function matches() {
  const query = searchQuery.value.trim().toLocaleLowerCase();
  return query
    ? Array.from(
        document.querySelectorAll<HTMLElement>(".message-entry"),
      ).filter((element) =>
        element.textContent?.toLocaleLowerCase().includes(query),
      )
    : [];
}
async function refreshSearch() {
  await nextTick();
  const found = matches();
  document
    .querySelectorAll<HTMLElement>(".message-entry")
    .forEach((element) =>
      element.classList.toggle("search-match", found.includes(element)),
    );
  matchCount.value = found.length;
  matchIndex.value = 0;
  if (found.length)
    found[0]?.scrollIntoView({ block: "center", behavior: "smooth" });
}
function searchNext(direction: number) {
  const found = matches();
  matchCount.value = found.length;
  if (!found.length) return;
  matchIndex.value =
    (matchIndex.value + direction + found.length) % found.length;
  found[matchIndex.value]?.scrollIntoView({
    block: "center",
    behavior: "smooth",
  });
}
watch(searchQuery, refreshSearch);
watch(() => conversation.state.value.messages, refreshSearch, { deep: true });
const artifactRevision = computed(
  () =>
    `${fileRevision.value}-${conversation.state.value.phase}-${conversation.state.value.messages.filter((m) => m.finished_at).length}`,
);
const replyArtifacts = ref<ReplyArtifact[]>([]);
let artifactController: AbortController | null = null;
onScopeDispose(() => artifactController?.abort());
watch(
  () => [sid.value, artifactRevision.value],
  async ([sessionId], previous) => {
    artifactController?.abort();
    if (previous?.[0] !== sessionId) replyArtifacts.value = [];
    if (!sessionId) return;
    artifactController = new AbortController();
    const signal = artifactController.signal;
    try {
      const result = await manager.sessionArtifacts(sessionId, signal);
      if (!signal.aborted) replyArtifacts.value = result.items;
    } catch {
      if (!signal.aborted) replyArtifacts.value = [];
    }
  },
  { immediate: true },
);
const artifactsByReply = computed(() =>
  groupReplyArtifacts(replyArtifacts.value),
);
</script>
<template>
  <section class="conversation-layout">
    <div class="chat-column">
      <ConversationTopbar
        :title="conversation.task.value?.name || '正在载入对话'"
        :project-id="projectId"
        :project-name="project?.project_name"
        :panel-open="workspaceOpen"
        :search-query="searchQuery"
        :match-count="matchCount"
        :match-index="matchIndex"
        @toggle-panel="workspaceOpen = !workspaceOpen"
        @update:search-query="searchQuery = $event"
        @search-next="searchNext"
      />
      <div v-if="runtime.error.value" class="error" role="alert">
        {{ runtime.error.value }}
      </div>
      <div
        v-if="conversation.error.value || conversation.streamError.value"
        class="stream-banner"
        role="alert"
      >
        <span>{{
          conversation.error.value || conversation.streamError.value
        }}</span
        ><button
          v-if="conversation.connection.value !== 'connected'"
          @click="conversation.retry"
        >
          重新连接
        </button>
      </div>
      <div
        v-else-if="conversation.connection.value !== 'connected'"
        class="connection-note"
      >
        {{
          conversation.connection.value === "retrying"
            ? "连接中断，正在恢复事件…"
            : "正在连接会话…"
        }}
      </div>
      <div
        v-if="
          conversation.loading.value &&
          !conversation.state.value.messages.length
        "
        class="empty loading-chat"
      >
        <t-loading text="正在读取会话" />
      </div>
      <MessageList
        v-else
        :messages="conversation.state.value.messages"
        :display-names="conversation.task.value?.agent_display_names"
        :default-display-name="conversation.task.value?.definition_display_name"
        :personal="conversation.task.value?.definition_id === assistant?.id"
        :loading="conversation.loading.value"
        :has-more="conversation.hasMore.value"
        :confirm="conversation.confirm"
        @older="conversation.older"
        @file="openFile($event, 'work')"
      >
        <template #message-artifacts="{ message }">
          <ArtifactList
            v-if="artifactsByReply[message.id]?.length"
            :files="artifactsByReply[message.id] || []"
            @open="openFile"
            @view-all="showArtifacts"
          />
        </template>
      </MessageList>
      <div
        v-if="conversation.state.value.subagentConfirmations.length"
        class="subagent-confirmations"
      >
        <section
          v-for="entry in conversation.state.value.subagentConfirmations"
          :key="`${entry.worker_session_id}-${entry.reply_id}`"
        >
          <p class="muted">{{ entry.worker_agent_name }} 正在等待确认</p>
          <PermissionRequestCard
            v-for="tool in entry.event.tool_calls || []"
            :key="tool.id"
            :tool="tool"
            :confirm="
              (call, allowed) =>
                conversation.confirm(entry.reply_id, call, allowed)
            "
          />
        </section>
      </div>
      <div class="chat-composer">
        <TaskComposer
          :project-id="projectId"
          :file-revision="fileRevision"
          :session-id="sid"
          v-model="text"
          compact
          :selected-label="conversation.task.value?.definition_display_name"
          @select="selectExpert"
          :models="models"
          :model-key="conversation.task.value?.model_key || defaultModelKey"
          :permission-mode="
            conversation.task.value?.permission_mode || 'default'
          "
          :permission-options="runtime.options.value"
          :settings-disabled="
            conversation.loading.value ||
            uploading ||
            conversation.submitting.value ||
            conversation.state.value.phase !== 'idle' ||
            runtime.loading.value ||
            settingsPending ||
            !!runtime.error.value
          "
          @update:model-key="conversation.updateSettings({ model_key: $event })"
          @update:permission-mode="
            conversation.updateSettings({ permission_mode: $event })
          "
          :is-personal="
            conversation.task.value?.definition_id === assistant?.id
          "
          :pending="conversation.submitting.value || uploading"
          :attachments="attachments.files.value"
          @attach="attach"
          @remove-attachment="attachments.remove"
          :disabled="
            conversation.loading.value ||
            settingsPending ||
            conversation.connection.value !== 'connected'
          "
          :running="conversation.state.value.phase !== 'idle'"
          :interrupting="conversation.state.value.phase === 'interrupting'"
          @submit="send"
          @stop="conversation.stop"
        >
          <template #collaborators>
            <CollaboratorChips
              :members="collaborationChips"
              :disabled="
                uploading ||
                conversation.submitting.value ||
                conversation.state.value.phase !== 'idle'
              "
              @remove="removeExpert"
            />
          </template>
          <template #footer>
            <ComposerProjectBar
              :project-id="projectId"
              :projects="projects"
              readonly
            >
              {{
                pendingExperts.length
                  ? "发送后邀请所选专家在当前对话协作，共享项目文件。"
                  : conversation.state.value.phase === "waiting"
                    ? "正在等待你的确认"
                    : conversation.state.value.phase === "interrupting"
                      ? "已请求停止，等待服务端结束当前执行"
                      : "内容由 AI 生成，请核对重要信息。"
              }}
            </ComposerProjectBar>
          </template>
        </TaskComposer>
      </div>
    </div>
    <WorkspacePanel
      v-if="conversation.task.value || projectId"
      ref="workspace"
      :session-id="sid"
      :project-id="projectId"
      :revision="artifactRevision"
      :visible="workspaceOpen"
      :messages="conversation.state.value.messages"
      :plan="conversation.state.value.plan ?? conversation.task.value?.plan"
      @close="workspaceOpen = false"
      @uploaded="fileRevision++"
    />
  </section>
</template>
<style scoped src="../styles/components/conversation-view.css"></style>
