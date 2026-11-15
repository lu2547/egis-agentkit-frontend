<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import { useScrollFollower } from "../../composables/useScrollFollower";
import type { Msg, ToolCallBlock } from "@agentscope-ai/agentscope/message";
import { ArrowDown } from "lucide-vue-next";
import UserMessage from "./UserMessage.vue";
import AssistantMessage from "./AssistantMessage.vue";
import {
  replyAnnotations,
  type TextAnnotation,
} from "../../domain/textAnnotations";
const props = defineProps<{
  messages: Msg[];
  displayNames?: Record<string, string>;
  defaultDisplayName?: string;
  personal?: boolean;
  preparing?: boolean;
  sessionId?: string;
  branchDisabled?: boolean;
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
defineEmits<{
  older: [];
  file: [path: string];
  reference: [value: import("../../domain/previewReferences").PreviewReference];
  annotation: [value: TextAnnotation];
  branched: [task: import("../../types/api").Task];
  knowledge: [
    value: import("../../domain/knowledgeSources").KnowledgeReference,
  ];
}>();
const viewport = ref<HTMLElement | null>(null);
const content = ref<HTMLElement | null>(null);
const { sticky, onScroll, follow, scrollToBottom } = useScrollFollower(
  viewport,
  content,
);
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
  () => props.messages,
  async () => {
    await nextTick();
    follow();
  },
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
          v-for="message in messages"
          :key="message.id"
          :data-message-id="message.id"
          class="message-entry"
          :class="{ 'message-arriving': arriving.has(message.id) }"
        >
          <UserMessage
            v-if="message.role === 'user'"
            :message="message"
            @reference="$emit('reference', $event)"
            @annotation="$emit('annotation', $event)"
          /><AssistantMessage
            v-else-if="message.role === 'assistant'"
            :message="message"
            :confirm="confirm"
            :session-id="sessionId"
            :branch-disabled="branchDisabled"
            :feedback="replyFeedback?.[message.id]"
            @branched="$emit('branched', $event)"
            :display-name="displayNames?.[message.name] || defaultDisplayName"
            :personal="personal"
            :annotations="replyAnnotations(messages, message.id)"
            @file="$emit('file', $event)"
            @annotation="$emit('annotation', $event)"
            @knowledge="$emit('knowledge', $event)"
          />
          <slot
            v-if="message.role === 'assistant'"
            name="message-artifacts"
            :message="message"
          />
        </div>
        <AssistantMessage
          v-if="preparing"
          class="assistant-preparing"
          preparing
          :display-name="defaultDisplayName"
          :personal="personal"
          :confirm="confirm"
        />
        <div v-if="!messages.length && !loading && !preparing" class="empty">
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
