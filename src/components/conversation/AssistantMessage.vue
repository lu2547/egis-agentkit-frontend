<script setup lang="ts">
import { computed } from "vue";
import { presentTurn } from "../../domain/turnPresentation";
import type { Msg, ToolCallBlock } from "@agentscope-ai/agentscope/message";
import MarkdownContent from "./MarkdownContent.vue";
import TurnProcess from "./TurnProcess.vue";
import ReplyActions from "./ReplyActions.vue";
import type { Task, ReplyFeedbackState } from "../../types/api";
import PermissionRequestCard from "./PermissionRequestCard.vue";
import type { TextAnnotation } from "../../domain/textAnnotations";
const props = defineProps<{
  message?: Msg;
  preparing?: boolean;
  displayName?: string;
  skillNames?: ReadonlyMap<string, string>;
  personal?: boolean;
  annotations?: TextAnnotation[];
  sessionId?: string;
  branchDisabled?: boolean;
  feedback?: ReplyFeedbackState;
  confirm: (
    replyId: string,
    tool: ToolCallBlock,
    allowed: boolean,
    rememberForSession?: boolean,
  ) => Promise<void>;
}>();
defineEmits<{
  file: [path: string];
  annotation: [value: TextAnnotation];
  branched: [task: Task];
}>();
const presentation = computed(() =>
  props.message ? presentTurn(props.message, props.skillNames) : undefined,
);
const replyError = computed(() =>
  props.message?.error?.message === "The reply failed with an unknown error."
    ? "本次处理意外中断。请展开过程查看执行记录后重试。"
    : props.message?.error?.message,
);
</script>
<template>
  <article class="assistant-message">
    <div class="assistant-label">
      <img
        class="assistant-mark"
        :src="
          personal ? '/brand/sheep-head-v1.png' : '/brand/assistant-icon.png'
        "
        alt=""
      />
      <span>{{ displayName || "养老险GPT" }}</span>
    </div>
    <div v-if="preparing" class="assistant-content">
      <p class="preparing-status running-shimmer" role="status">准备中</p>
    </div>
    <div v-else-if="message && presentation" class="assistant-content">
      <TurnProcess
        :message="message"
        :entries="presentation.entries"
        :tool-count="presentation.toolCount"
        @file="$emit('file', $event)"
      />
      <PermissionRequestCard
        v-for="tool in presentation.confirmations"
        :key="tool.id"
        :tool="tool"
        :confirm="confirm.bind(null, message.id)"
      />
      <MarkdownContent
        v-if="presentation.answer"
        :text="presentation.answer"
        data-annotation-content
        :annotations="annotations"
        @file="$emit('file', $event)"
        @annotation="$emit('annotation', $event)"
      />
      <div
        v-if="message.finished_at && presentation.answer && annotations?.length"
        class="annotation-answer-links"
      >
        <template
          v-for="(annotation, index) in annotations"
          :key="annotation.id"
        >
          <button
            v-if="!presentation.answer.includes(`[[annotation:${index + 1}]]`)"
            type="button"
            @click="$emit('annotation', annotation)"
          >
            注释 {{ index + 1 }}
          </button>
        </template>
      </div>
      <p v-if="message.finished_reason === 'interrupted'" class="finish-note">
        已停止生成
      </p>
      <div v-if="message.error" class="error" role="alert">
        {{ replyError }}
      </div>
      <p
        v-if="message.finished_reason === 'exceed_max_iters'"
        class="finish-note"
      >
        已达到本轮最大处理次数。你可以补充要求后继续。
      </p>
      <ReplyActions
        v-if="sessionId && message.finished_at && presentation.answer"
        :key="`${sessionId}:${message.id}`"
        :session-id="sessionId"
        :message="message"
        :answer="presentation.answer"
        :branch-disabled="branchDisabled"
        :feedback="feedback"
        @branched="$emit('branched', $event)"
      />
    </div>
  </article>
</template>
<style scoped src="../../styles/components/assistant-message.css"></style>
