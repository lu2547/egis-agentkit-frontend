<script setup lang="ts">
import { computed } from "vue";
import { presentTurn } from "../../domain/turnPresentation";
import type { Msg, ToolCallBlock } from "@agentscope-ai/agentscope/message";
import MarkdownContent from "./MarkdownContent.vue";
import TurnProcess from "./TurnProcess.vue";
import PermissionRequestCard from "./PermissionRequestCard.vue";
const props = defineProps<{
  message: Msg;
  displayName?: string;
  personal?: boolean;
  confirm: (
    replyId: string,
    tool: ToolCallBlock,
    allowed: boolean,
  ) => Promise<void>;
}>();
defineEmits<{ file: [path: string] }>();
const presentation = computed(() => presentTurn(props.message));
const replyError = computed(() =>
  props.message.error?.message === "The reply failed with an unknown error."
    ? "本次处理意外中断。请展开过程查看执行记录后重试。"
    : props.message.error?.message,
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
    <div class="assistant-content">
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
        :confirm="(call, allowed) => confirm(message.id, call, allowed)"
      />
      <MarkdownContent
        v-if="presentation.answer"
        :text="presentation.answer"
        @file="$emit('file', $event)"
      />
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
    </div>
  </article>
</template>
<style scoped src="../../styles/components/assistant-message.css"></style>
