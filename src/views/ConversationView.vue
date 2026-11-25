<script setup lang="ts">
import { usePreviewReferences } from "../composables/usePreviewReferences";
import type {
  ChatReference,
  PreviewReference,
  PreviewAcceptance,
} from "../domain/previewReferences";
import { ref, shallowRef, watch, computed, nextTick, onScopeDispose } from "vue";
import { useRoute, useRouter } from "vue-router";
import { manager } from "../api/manager";
import { runtime as chatRuntime } from "../api/runtime";
import type { Definition, Collaborator } from "../types/api";
import {
  expertInvitation,
  invitationRef,
  isInvitableExpert,
  sameExpert,
} from "../domain/expertInvitations";
import CollaboratorChips from "../components/conversation/CollaboratorChips.vue";
import CollaboratorWindow from "../components/conversation/CollaboratorWindow.vue";
import ConversationTopbar from "../components/layout/ConversationTopbar.vue";
import { useRuntimeOptions } from "../composables/useRuntimeOptions";
import { useConversation } from "../composables/useConversation";
import { useIdentity } from "../composables/useIdentity";
import { useAttachments } from "../composables/useAttachments";
import { ApiError, errorText } from "../api/http";
import type { ReplyArtifact } from "../types/api";
import { groupReplyArtifacts } from "../domain/replyArtifacts";
import { peekDraft, takeDraft } from "../composables/usePendingDraft";
import TaskComposer from "../components/composer/TaskComposer.vue";
import SteeringQueue from "../components/composer/SteeringQueue.vue";
import { steeringState } from "../domain/steering";
import { useSteeringQueue } from "../composables/useSteeringQueue";
import ComposerProjectBar from "../components/composer/ComposerProjectBar.vue";
import PermissionRequestCard from "../components/conversation/PermissionRequestCard.vue";
import MessageList from "../components/conversation/MessageList.vue";
import ArtifactList from "../components/workspace/ArtifactList.vue";
import WorkspacePanel from "../components/workspace/WorkspacePanel.vue";
import MessageAnnotationLayer from "../components/conversation/MessageAnnotationLayer.vue";
import type { TextAnnotation } from "../domain/textAnnotations";
import { replyKnowledgeReferences } from "../domain/turnPresentation";
import { ChevronRight } from "lucide-vue-next";
const route = useRoute(),
  router = useRouter(),
  conversation = useConversation(),
  { refreshTasks, tasks, projects, assistant, models, defaultModelKey } =
    useIdentity();
const runtime = useRuntimeOptions();
void runtime.load();
const settingsPending = conversation.settingsPending;
const openedWorkerWindows = ref(new Set<string>());
const minimizedWorkerWindows = ref(new Set<string>());
const collaboratorEntries = computed(() =>
  Array.from(conversation.collaboratorProgress.value.values()),
);
const activeWorkers = computed(() =>
  collaboratorEntries.value.filter(worker => ["queued", "running", "waiting"].includes(worker.status)),
);
const visibleWorkerWindows = computed(() =>
  collaboratorEntries.value.filter((worker) =>
    openedWorkerWindows.value.has(worker.worker_session_id),
  ),
);
const expandedWorkerWindows = computed(() =>
  new Set(
    [...openedWorkerWindows.value].filter(
      (id) => !minimizedWorkerWindows.value.has(id),
    ),
  ),
);
function showWorkerWindow(id: string) {
  if (!conversation.collaboratorProgress.value.has(id)) return;
  openedWorkerWindows.value.add(id);
  minimizedWorkerWindows.value.delete(id);
  void nextTick(() =>
    document.getElementById(`collaborator-window-${id}`)?.focus({ preventScroll: true }),
  );
}
function minimizeWorkerWindow(id: string, minimized: boolean) {
  if (minimized) minimizedWorkerWindows.value.add(id);
  else minimizedWorkerWindows.value.delete(id);
}
function closeWorkerWindow(id: string) {
  openedWorkerWindows.value.delete(id);
  minimizedWorkerWindows.value.delete(id);
  void nextTick(() =>
    document.getElementById(`collaborator-entry-${id}`)?.focus({ preventScroll: true }),
  );
}
watch(() => route.params.sessionId, () => {
  openedWorkerWindows.value.clear();
  minimizedWorkerWindows.value.clear();
});
const stagedExperts = ref<Collaborator[]>([]);
const removingExperts = ref(new Set<string>());
const invitationDirty = ref(false);
let invitationRequestId = "";
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
function selectExpert(definition: Definition) {
  if (uploading.value || conversation.submitting.value) return;
  if (
    !conversation.task.value?.collaboration_allowed ||
    !isInvitableExpert(definition)
  ) {
    conversation.error.value =
      "仅个人助理对话可以邀请专家协作，固定专家团成员不在这里调整。";
    return;
  }
  const target = expertInvitation(definition);
  const joined = (conversation.task.value?.collaborators || []).find(
    (member) => member.status === "joined" && sameExpert(member, target),
  );
  if (joined && joined.resource_version !== target.resource_version) {
    conversation.error.value = "已加入的专家版本无法更换。";
    return;
  }
  const pending = pendingExperts.value.find((item) => sameExpert(item, target));
  if (pending?.resource_version === target.resource_version) return;
  if (!pending && pendingExperts.value.length >= 16) {
    conversation.error.value = "本次最多选择 16 位协作专家。";
    return;
  }
  stagedExperts.value = [
    ...pendingExperts.value.filter((item) => !sameExpert(item, target)),
    target,
  ];
  invitationDirty.value = true;
  invitationRequestId = "";
}
async function removeExpert(member: Collaborator) {
  if (member.status === "pending") {
    stagedExperts.value = pendingExperts.value.filter(
      (item) => !sameExpert(item, member),
    );
    invitationDirty.value = true;
    invitationRequestId = "";
    return;
  }
  const workerSid = member.worker_session_id;
  if (
    !workerSid ||
    removingExperts.value.has(workerSid) ||
    uploading.value ||
    conversation.submitting.value
  )
    return;
  const targetSid = sid.value;
  const signal = attachmentController.signal;
  removingExperts.value.add(workerSid);
  conversation.error.value = "";
  try {
    const updated = await withCollaborationReady(
      () => manager.removeCollaborator(targetSid, workerSid, signal),
      signal,
    );
    if (!signal.aborted && conversation.task.value?.session_id === targetSid) {
      conversation.task.value = { ...conversation.task.value, ...updated };
      conversation.forgetCollaborator(workerSid);
    }
  } catch (error) {
    if (!signal.aborted) conversation.error.value = errorText(error);
  } finally {
    if (!signal.aborted) removingExperts.value.delete(workerSid);
  }
}
const text = ref(""),
  workspaceOpen = ref(
    peekDraft(String(route.params.sessionId || ""))?.workspaceOpen ??
      window.innerWidth >= 1100,
  ),
  workspace = ref<InstanceType<typeof WorkspacePanel> | null>(null);
const sid = computed(() => String(route.params.sessionId || ""));
const openingDraft = shallowRef<ReturnType<typeof peekDraft>>();
// 首条消息在读取会话和建立连接期间留在原位，发送时沿用同一个消息 ID。
const openingMessage = computed(() => {
  const message = openingDraft.value?.message;
  return message &&
    !conversation.state.value.messages.some((item) => item.id === message.id)
    ? message
    : undefined;
});
const visibleMessages = computed(() =>
  openingMessage.value
    ? [...conversation.state.value.messages, openingMessage.value]
    : conversation.state.value.messages,
);
const projectId = computed(
  () =>
    conversation.task.value?.project_id ||
    tasks.value.find((task) => task.session_id === sid.value)?.project_id,
);
const project = computed(() =>
  projects.value.find((item) => item.id === projectId.value),
);
const references = usePreviewReferences(projectId);
const annotations = ref<TextAnnotation[]>([]);
const steeringQueue = useSteeringQueue(
  sid,
  computed(() => runtime.steering.value?.max_batch_size || 0),
  computed(() => {
    const task = conversation.task.value;
    return task?.session_id === sid.value ? task.agent_id : "";
  }),
  computed(() => [...conversation.state.value.messages].reverse().find(message => message.role === "assistant" && !message.finished_at)?.id || ""),
  message => { conversation.error.value = message; },
  computed(() => new Set(visibleMessages.value.filter(message =>
    !steeringState(message) || steeringState(message) === "received",
  ).map(message => message.id))),
);
watch(
  [steeringQueue.messages, conversation.loading, () => conversation.task.value?.session_id],
  () => conversation.syncQueuedMessages(sid.value, steeringQueue.messages.value),
  { immediate: true, flush: "sync" },
);
async function queueSteering() {
  const task = conversation.task.value;
  if (!task || uploading.value || conversation.submitting.value) return;
  const current = generation,
    targetSid = sid.value,
    value = text.value.trim();
  const selectedFiles = [...attachments.files.value];
  const selectedReferences = [...references.items.value];
  const selectedAnnotations = annotations.value.map((item) => ({ ...item }));
  uploading.value = true;
  try {
    references.validate();
    const message = await attachments.upload(
      task.project_id,
      value,
      selectedFiles,
      attachmentController.signal,
    );
    if (generation !== current || sid.value !== targetSid) return;
    const accepted = await steeringQueue.add(message, selectedReferences, selectedAnnotations);
    if (generation !== current || sid.value !== targetSid) return;
    if (accepted) {
      if (text.value.trim() === value) text.value = "";
      attachments.removeUploaded(selectedFiles);
      for (const reference of selectedReferences)
        references.remove(reference.id);
      annotations.value = annotations.value.filter(
        (item) => !selectedAnnotations.some((sent) => sent.id === item.id),
      );
      return accepted;
    }
  } catch (error) {
    if (generation === current && sid.value === targetSid)
      conversation.error.value = errorText(error);
  } finally {
    if (generation === current && sid.value === targetSid)
      uploading.value = false;
  }
}
const annotationLayer = ref<InstanceType<typeof MessageAnnotationLayer>>();
function addTextAnnotation(value: TextAnnotation) {
  const existing = annotations.value.find(
    (item) =>
      item.messageId === value.messageId &&
      item.start === value.start &&
      item.end === value.end,
  );
  if (!existing) annotations.value = [...annotations.value, value];
  focusDraftAnnotation(existing?.id || value.id);
}
function focusDraftAnnotation(id: string) {
  nextTick(() =>
    document
      .querySelector<HTMLTextAreaElement>(
        `[data-annotation-card="${CSS.escape(id)}"] textarea`,
      )
      ?.focus({ preventScroll: true }),
  );
}
function updateTextAnnotation(id: string, comment: string) {
  annotations.value = annotations.value.map((item) =>
    item.id === id ? { ...item, comment } : item,
  );
}
function removeTextAnnotation(id: string) {
  annotations.value = annotations.value.filter((item) => item.id !== id);
}
const composer = ref<InstanceType<typeof TaskComposer>>();
function addReference(value: PreviewReference, accept: PreviewAcceptance) {
  const accepted = references.add(value);
  accept(accepted);
  if (accepted) composer.value?.focusComposer();
}
function openReference(value: ChatReference) {
  if (value.projectId !== projectId.value) {
    conversation.error.value = "引用属于其他项目，无法在当前工作空间定位";
    return;
  }
  workspaceOpen.value = true;
  setTimeout(() => workspace.value?.openReference(value), 0);
}
const attachments = useAttachments(),
  uploading = ref(false),
  collaborationWaiting = ref<"session" | "expert" | null>(null),
  fileRevision = ref(0);
let attachmentController = new AbortController();
onScopeDispose(() => attachmentController.abort());
const COLLABORATION_STATUS_INTERVAL = 1_000;

async function withCollaborationReady<T>(
  operate: () => Promise<T>,
  signal: AbortSignal,
  onWaiting?: (state: "session" | "expert" | null) => void,
): Promise<T> {
  try {
    while (true) {
      signal.throwIfAborted();
      try {
        return await operate();
      } catch (error) {
        if (
          !(error instanceof ApiError) ||
          error.status !== 409 ||
          !error.busySession
        )
          throw error;
        const { sessionId, agentId } = error.busySession;
        onWaiting?.(sessionId === sid.value ? "session" : "expert");
        let status: string;
        do {
          await new Promise((resolve) =>
            setTimeout(resolve, COLLABORATION_STATUS_INTERVAL),
          );
          signal.throwIfAborted();
          ({ status } = await chatRuntime.status(sessionId, agentId, signal));
        } while (status === "running");
        signal.throwIfAborted();
        onWaiting?.(null);
      }
    }
  } finally {
    if (!signal.aborted) onWaiting?.(null);
  }
}

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
    removingExperts.value.clear();
    invitationDirty.value = false;
    invitationRequestId = "";
    attachments.clear();
    references.clear();
    annotations.value = [];
    uploading.value = false;
    collaborationWaiting.value = null;
    const draft = peekDraft(value);
    openingDraft.value = draft;
    if (draft) workspaceOpen.value = draft.workspaceOpen;
    await conversation.open(value, draft?.task);
    if (
      generation !== current ||
      sid.value !== value ||
      conversation.task.value?.session_id !== value
    )
      return;
    if (draft) {
      if (
        !conversation.error.value &&
        await conversation.sendMessage(draft.message)
      )
        takeDraft(value);
      else if (generation === current && sid.value === value && !text.value) {
        text.value = draft.text;
        references.items.value = draft.references;
      }
      if (generation === current && sid.value === value)
        openingDraft.value = undefined;
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
  const task = conversation.task.value;
  if (!task || conversation.loading.value || uploading.value) return;
  const current = generation,
    targetSid = sid.value;
  attachments.add(files);
  uploading.value = true;
  conversation.error.value = "";
  try {
    await attachments.ensureUploaded(
      task.project_id,
      files,
      attachmentController.signal,
    );
  } catch (error) {
    if (generation === current && sid.value === targetSid)
      conversation.error.value = errorText(error);
  } finally {
    if (generation === current && sid.value === targetSid) {
      fileRevision.value++;
      uploading.value = false;
    }
  }
}
async function send() {
  const value = text.value.trim();
  const task = conversation.task.value;
  if (
    (!value && !annotations.value.length && !references.items.value.length) ||
    !task ||
    uploading.value ||
    conversation.submitting.value ||
    conversation.state.value.phase !== "idle"
  )
    return;
  const current = generation,
    targetSid = sid.value,
    selectedFiles = [...attachments.files.value],
    signal = attachmentController.signal;
  uploading.value = true;
  conversation.error.value = "";
  try {
    references.validate();
    const selectedReferences = [...references.items.value];
    const selectedAnnotations = annotations.value.map((item) => ({ ...item }));
    const message = await attachments.upload(
      task.project_id,
      value,
      selectedFiles,
      signal,
    );
    if (generation !== current || sid.value !== targetSid) return;
    fileRevision.value++;
    if (invitationDirty.value || pendingExperts.value.length) {
      invitationRequestId ||=
        (!invitationDirty.value &&
          conversation.task.value?.pending_collaboration_request_id) ||
        crypto.randomUUID();
      const requestId = invitationRequestId;
      const experts = pendingExperts.value.map(invitationRef);
      const prepared = await withCollaborationReady(
        () => manager.prepareCollaborators(targetSid, requestId, experts, signal),
        signal,
        (state) => {
          collaborationWaiting.value = state;
        },
      );
      if (generation !== current || sid.value !== targetSid) return;
      conversation.task.value = { ...conversation.task.value!, ...prepared };
    }
    const accepted = await conversation.send(
      message,
      selectedReferences,
      selectedAnnotations,
    );
    if (accepted) takeDraft(targetSid);
    if (accepted && generation === current && sid.value === targetSid) {
      if (text.value.trim() === value) text.value = "";
      attachments.removeUploaded(selectedFiles);
      for (const item of selectedReferences) references.remove(item.id);
      annotations.value = annotations.value.filter(
        (item) => !selectedAnnotations.some((sent) => sent.id === item.id),
      );
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
  setTimeout(() => workspace.value?.openArtifacts(), 0);
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
    `${fileRevision.value}-${conversation.state.value.phase}-${conversation.state.value.messages.filter((message) => message.finished_at).length}`,
);
const workspaceRevision = computed(() => {
  const { messages } = conversation.state.value;
  const completedTools = messages.reduce(
    (count, message) =>
      count +
      message.content.filter(
        (block) => block.type === "tool_result" && block.finished_at,
      ).length,
    0,
  );
  return `${artifactRevision.value}-${completedTools}`;
});
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
const sourcesByReply = computed(() => new Map(
  conversation.state.value.messages
    .filter((message) => message.role === "assistant")
    .map((message) => [message.id, replyKnowledgeReferences(message)]),
));
async function openSources(replyId: string) {
  workspaceOpen.value = true;
  await nextTick();
  workspace.value?.openSources(replyId);
}
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
      <div v-if="visibleWorkerWindows.length" class="collaborator-windows-anchor">
        <div class="collaborator-windows" aria-label="专家运行进度">
          <CollaboratorWindow
            v-for="progress in visibleWorkerWindows"
            :id="`collaborator-window-${progress.worker_session_id}`"
            :key="`${sid}:${progress.worker_session_id}`"
            :progress="progress"
            :minimized="minimizedWorkerWindows.has(progress.worker_session_id)"
            @update:minimized="minimizeWorkerWindow(progress.worker_session_id, $event)"
            @close="closeWorkerWindow(progress.worker_session_id)"
            @file="openFile($event, 'work')"
          />
        </div>
      </div>
      <div v-if="runtime.error.value" class="error" role="alert">
        {{ runtime.error.value }}
      </div>
      <div
        v-if="conversation.error.value || conversation.streamError.value || steeringQueue.notice.value"
        class="stream-banner"
        :role="conversation.error.value || conversation.streamError.value ? 'alert' : 'status'"
      >
        <span>{{
          conversation.error.value || conversation.streamError.value || steeringQueue.notice.value
        }}</span
        ><button
          v-if="conversation.connection.value !== 'connected'"
          @click="conversation.retry"
        >
          重新连接
        </button>
      </div>
      <div
        v-else-if="
          conversation.connection.value !== 'connected' &&
          (!openingDraft || conversation.connection.value !== 'connecting')
        "
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
          !visibleMessages.length
        "
        class="empty loading-chat"
      >
        <t-loading text="正在读取会话" />
      </div>
      <MessageAnnotationLayer
        v-else
        :key="sid"
        ref="annotationLayer"
        :messages="visibleMessages"
        :drafts="annotations"
        :has-more="conversation.hasMore.value"
        :load-older="conversation.older"
        @add="addTextAnnotation"
        @focus-draft="focusDraftAnnotation"
      >
        <div
          v-if="conversation.state.value.phase === 'idle' && activeWorkers.length"
          class="collaboration-ongoing"
          role="status"
        >主助理已结束，{{ activeWorkers.length }} 位专家仍在处理</div>
        <MessageList
          :reply-feedback="conversation.replyFeedback.value"
          :reply-id="typeof route.query.reply_id === 'string' ? route.query.reply_id : undefined"
          :session-id="sid"
          :resend="conversation.resend"
          :resend-error="conversation.error.value"
          :edit-disabled="
            conversation.loading.value ||
            conversation.submitting.value ||
            conversation.state.value.phase !== 'idle' ||
            conversation.connection.value !== 'connected' ||
            uploading || runtime.loading.value || settingsPending || !!runtime.error.value ||
            steeringQueue.items.value.length > 0 ||
            [...conversation.collaboratorProgress.value.values()].some(entry => ['running', 'waiting'].includes(entry.status))
          "
          :branch-disabled="
            conversation.loading.value ||
            conversation.state.value.phase !== 'idle'
          "
          @branched="
            async (task) => {
              await refreshTasks();
              await router.push(`/tasks/${task.session_id}`);
            }
          "
          :messages="visibleMessages"
          :collaborators="collaboratorEntries"
          :expanded-workers="expandedWorkerWindows"
          @collaborator="showWorkerWindow"
          :preparing="conversation.state.value.isPreparing || !!openingMessage"
          :preparing-text="steeringQueue.waitingForExecution.value ? '排队等待执行' : undefined"
          :display-names="conversation.task.value?.agent_display_names"
          :default-display-name="
            conversation.task.value?.definition_display_name
          "
          :personal="conversation.task.value?.definition_id === assistant?.id"
          :loading="conversation.loading.value"
          :has-more="conversation.hasMore.value"
          :confirm="conversation.confirm"
          @older="conversation.older"
          @file="openFile($event, 'work')"
          @reference="openReference"
          @annotation="annotationLayer?.focusAnnotation($event)"
        >
          <template #message-artifacts="{ message }">
            <ArtifactList
              v-if="artifactsByReply[message.id]?.length"
              :files="artifactsByReply[message.id] || []"
              @open="openFile"
              @view-all="showArtifacts"
            />
            <button
              v-if="sourcesByReply.get(message.id)?.length"
              :id="`reply-sources-${message.id}`"
              type="button"
              class="reply-sources-entry"
              @click="openSources(message.id)"
            >
              引用来源 <span>({{ sourcesByReply.get(message.id)!.length }})</span>
              <ChevronRight :size="15" aria-hidden="true" />
            </button>
          </template>
        </MessageList>
      </MessageAnnotationLayer>
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
              (call, allowed, rememberForSession) =>
                conversation.confirm(
                  entry.reply_id,
                  call,
                  allowed,
                  rememberForSession,
                )
            "
          />
        </section>
      </div>
      <div class="chat-composer">
        <TaskComposer
          ref="composer"
          :references="references.items.value"
          :reference-error="references.error.value"
          @add-file-reference="references.add"
          :annotations="annotations"
          @update-annotation="updateTextAnnotation"
          @remove-annotation="removeTextAnnotation"
          @locate-annotation="annotationLayer?.focusAnnotation($event)"
          @remove-reference="references.remove"
          @open-reference="openReference"
          :project-id="projectId"
          :file-revision="fileRevision"
          :session-id="sid"
          v-model="text"
          compact
          :selected-label="conversation.task.value?.definition_display_name"
          :can-invite-experts="conversation.task.value?.collaboration_allowed"
          @select="selectExpert"
          :models="models"
          :model-key="conversation.task.value?.model_key || defaultModelKey"
          :permission-mode="
            conversation.task.value?.permission_mode ||
            runtime.defaultPermissionMode.value
          "
          :permission-options="runtime.options.value"
          :permission-disabled="
            conversation.loading.value ||
            uploading ||
            conversation.submitting.value ||
            !['idle', 'waiting'].includes(conversation.state.value.phase) ||
            runtime.loading.value ||
            settingsPending ||
            !!runtime.error.value
          "
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
          :steering-enabled="
            !!runtime.steering.value &&
            !runtime.loading.value &&
            ['streaming', 'waiting'].includes(conversation.state.value.phase)
          "
          :max-text-length="runtime.steering.value?.max_text_length"
          :interrupting="conversation.state.value.phase === 'interrupting'"
          @submit="send"
          @queue="queueSteering"
          @stop="conversation.stop"
        >
          <template #queue>
            <SteeringQueue
              :items="steeringQueue.items.value"
              :sending="steeringQueue.sending.value"
              :max-text-length="runtime.steering.value?.max_text_length"
              :disabled="
                conversation.loading.value ||
                conversation.state.value.phase === 'interrupting' ||
                conversation.connection.value !== 'connected'
              "
              @send="steeringQueue.send"
              @edit="steeringQueue.edit"
              @remove="steeringQueue.remove"
              @move="steeringQueue.move"
            />
          </template>
          <template #collaborators>
            <CollaboratorChips
              :members="collaborationChips"
              :removing="removingExperts"
              :disabled="uploading || conversation.submitting.value"
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
                collaborationWaiting === "session"
                  ? "上一轮正在收尾，结束后会自动继续"
                  : collaborationWaiting === "expert"
                    ? "正在等待专家结束，随后自动继续"
                    : pendingExperts.length
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
      :project-id="projectId"
      :session-id="sid"
      :revision="workspaceRevision"
      :visible="workspaceOpen"
      :messages="conversation.state.value.messages"
      :plan="conversation.state.value.plan ?? conversation.task.value?.plan"
      @close="workspaceOpen = false"
      @uploaded="fileRevision++"
      @reference="addReference"
    />
  </section>
</template>
<style scoped src="../styles/components/conversation-view.css"></style>
