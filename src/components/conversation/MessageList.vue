<script setup lang="ts">
import { computed, ref, watch, nextTick } from "vue";
import { manager } from "../../api/manager";
import { useAsyncData } from "../../composables/useAsyncData";
import { useScrollFollower } from "../../composables/useScrollFollower";
import type { Msg, ToolCallBlock } from "@agentscope-ai/agentscope/message";
import { ArrowDown } from "lucide-vue-next";
import UserMessage from "./UserMessage.vue";
import AssistantMessage from "./AssistantMessage.vue";
import CollaboratorWorkEntry from "./CollaboratorWorkEntry.vue";
import type { CollaboratorProgress } from "../../types/api";
import { conversationTimeline } from "../../domain/conversationTimeline";
import {
  replyAnnotations,
  type TextAnnotation,
} from "../../domain/textAnnotations";
const props = defineProps<{
  messages: Msg[];
  displayNames?: Record<string, string>;
  defaultDisplayName?: string;
  personal?: boolean;
  collaborators?: CollaboratorProgress[];
  expandedWorkers?: ReadonlySet<string>;
  preparing?: boolean;
  preparingText?: string;
  sessionId?: string;
  replyId?: string;
  branchDisabled?: boolean;
  editDisabled?: boolean;
  resendError?: string;
  resend?: (message: Msg, text: string) => Promise<boolean>;
  replyFeedback?: Record<string, import("../../types/api").ReplyFeedbackState>;
  loading: boolean;
  hasMore: boolean;
  confirm: (
    replyId: string,
    tool: ToolCallBlock,
    allowed: boolean,
    rememberForSession?: boolean,
  ) => Promise<void>;
}>();
const emit = defineEmits<{
  older: [];
  file: [path: string];
  reference: [value: import("../../domain/previewReferences").ChatReference];
  annotation: [value: TextAnnotation];
  branched: [task: import("../../types/api").Task];
  collaborator: [workerId: string];
}>();
const viewport = ref<HTMLElement | null>(null);
const content = ref<HTMLElement | null>(null);
const timeline = computed(() =>
  conversationTimeline(props.messages, props.collaborators),
);
const { sticky, onScroll, follow, scrollToBottom } = useScrollFollower(
  viewport,
  content,
);
const calledSkills = computed(() => [...new Set(props.messages.flatMap((message) =>
  message.content.flatMap((block) => {
    if (block.type !== "tool_call" || block.name !== "Skill") return [];
    try {
      const input = JSON.parse(block.input) as { skill?: unknown };
      return typeof input.skill === "string" ? [input.skill] : [];
    } catch { return []; }
  }),
))]);
const { data: skills, load: loadSkills } = useAsyncData(async () => {
  const names = calledSkills.value;
  const pages = await Promise.all(Array.from({ length: Math.ceil(names.length / 100) }, (_, index) =>
    manager.skillNames(names.slice(index * 100, (index + 1) * 100)),
  ));
  return { items: pages.flatMap((page) => page.items) };
});
const skillNames = computed(() => {
  const names = new Map<string, string>();
  for (const skill of skills.value?.items ?? []) {
    if (skill.runtime_name) names.set(skill.runtime_name, skill.display_name);
  }
  return names;
});
watch(() => calledSkills.value.join("\0"), (names) => { if (names) void loadSkills(); }, { immediate: true });
const arriving = ref(new Set<string>());
watch(
  () => props.messages.map((message) => message.id),
  (ids, previous) => {
    // Only animate new tail messages, never history loads or subsequent stream deltas.
    if (
      previous.length &&
      ids.length > previous.length &&
      previous.every((id, index) => ids[index] === id)
    ) {
      arriving.value = new Set([
        ...arriving.value,
        ...ids.slice(previous.length),
      ]);
    }
  },
);
watch(
  timeline,
  async () => {
    await nextTick();
    follow();
  },
);

let trackedReply: string | undefined;
let loadedBefore: string | undefined;
let revealed = false;
watch(
  () => [props.replyId, props.messages, props.loading, props.hasMore] as const,
  async ([replyId, messages, loading, hasMore]) => {
    if (trackedReply !== replyId) {
      trackedReply = replyId;
      loadedBefore = undefined;
      revealed = false;
    }
    if (!replyId || loading || revealed) return;
    if (messages.some((message) => message.id === replyId)) {
      // Wait for the usual conversation scroll setup before moving to the reply.
      await nextTick();
      if (props.replyId !== replyId || revealed) return;
      const target = content.value?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(replyId)}"]`);
      if (!target) return;
      revealed = true;
      sticky.value = false;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "start" });
    } else if (hasMore && messages[0] && loadedBefore !== messages[0].id) {
      loadedBefore = messages[0].id;
      emit("older");
    }
  },
  { immediate: true, flush: "post" },
);
</script>
<template>
  <section class="timeline-shell" aria-label="会话消息">
    <div ref="viewport" class="conversation-scroll" @scroll.passive="onScroll">
      <div
        ref="content"
        class="message-list"
        role="log"
        aria-live="polite"
        :aria-busy="loading"
      >
        <div v-if="hasMore" class="older">
          <t-button
            variant="text"
            size="small"
            :loading="loading"
            @click="$emit('older')"
            >加载更早的消息</t-button
          >
        </div>
        <div
          v-for="item in timeline"
          :key="`${item.kind}:${item.id}`"
          :data-message-id="item.kind === 'message' ? item.message.id : undefined"
          :data-segment-id="item.kind === 'message' ? item.id : undefined"
          :tabindex="item.kind === 'message' && item.message.id === replyId ? -1 : undefined"
          class="message-entry"
          :class="{
            'message-arriving': arriving.has(item.id),
            'collaborator-work-log': item.kind === 'collaborator',
          }"
        >
          <CollaboratorWorkEntry
            v-if="item.kind === 'collaborator'"
            :progress="item.progress"
            :stage="item.stage"
            :expanded="expandedWorkers?.has(item.progress.worker_session_id)"
            @open="$emit('collaborator', $event)"
          />
          <template v-else>
            <UserMessage
              v-if="item.message.role === 'user'"
              :message="item.message"
              :edit-disabled="editDisabled"
              :resend="resend"
              :resend-error="resendError"
              @reference="$emit('reference', $event)"
              @annotation="$emit('annotation', $event)"
            /><AssistantMessage
              v-else-if="item.message.role === 'assistant'"
              :message="item.message"
              :final-segment="item.final"
              :skill-names="skillNames"
              :confirm="confirm"
              :session-id="sessionId"
              :branch-disabled="branchDisabled"
              :feedback="replyFeedback?.[item.message.id]"
              @branched="$emit('branched', $event)"
              :display-name="displayNames?.[item.message.name] || defaultDisplayName"
              :personal="personal"
              :annotations="replyAnnotations(messages, item.message.id)"
              @file="$emit('file', $event)"
              @annotation="$emit('annotation', $event)"
            />
            <slot
              v-if="item.message.role === 'assistant' && item.final !== false"
              name="message-artifacts"
              :message="item.message"
            />
          </template>
        </div>
        <AssistantMessage
          v-if="preparing"
          class="assistant-preparing"
          preparing
          :preparing-text="preparingText"
          :display-name="defaultDisplayName"
          :personal="personal"
          :confirm="confirm"
        />
        <div v-if="!messages.length && !loading && !preparing && !collaborators?.length" class="empty">
          <h3>从一个问题开始</h3>
          <p>输入目标、背景与交付要求，养老险GPT 会在这里记录工作过程。</p>
        </div>
      </div>
    </div>
    <button
      v-if="!sticky"
      type="button"
      class="scroll-bottom"
      aria-label="滚动到底部"
      @click="scrollToBottom()"
    >
      <ArrowDown :size="21" />
    </button>
  </section>
</template>
<style scoped src="../../styles/components/message-list.css"></style>
