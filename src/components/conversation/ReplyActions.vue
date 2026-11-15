<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { MessagePlugin } from "tdesign-vue-next";
import {
  Copy,
  ThumbsDown,
  MoreHorizontal,
  GitBranch,
  Check,
} from "lucide-vue-next";
import type { Msg } from "@agentscope-ai/agentscope/message";
import type { Task, ReplyFeedbackState } from "../../types/api";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";
const props = defineProps<{
  sessionId: string;
  message: Msg;
  answer: string;
  branchDisabled?: boolean;
  feedback?: ReplyFeedbackState;
}>();
const emit = defineEmits<{ branched: [task: Task] }>();
const saved = ref(false);
const submitted = computed(() => saved.value || !!props.feedback);
const menu = ref(false),
  editing = ref(false),
  saving = ref(false),
  branching = ref(false);
const comment = ref(""),
  error = ref(""),
  feedbackError = ref(""),
  status = ref("");
watch(
  () => props.feedback,
  (value) => {
    if (value && !editing.value) comment.value = value.comment;
  },
  { immediate: true },
);
const timestamp = computed(() => {
  const date = new Date(props.message.finished_at || props.message.created_at);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
});
async function copyAnswer() {
  error.value = "";
  status.value = "";
  try {
    await navigator.clipboard.writeText(
      props.answer.replace(/\[\[annotation:(\d+)\]\]/g, "注释 $1"),
    );
    status.value = "已复制";
  } catch {
    error.value = "无法访问剪贴板，请允许浏览器复制后重试。";
  }
}
function closeMenu(event: FocusEvent) {
  if (
    event.currentTarget instanceof HTMLElement &&
    !event.currentTarget.contains(event.relatedTarget as Node)
  )
    menu.value = false;
}
function openFeedback() {
  feedbackError.value = "";
  editing.value = true;
  menu.value = false;
}
async function saveFeedback() {
  if (saving.value || !comment.value.trim()) return;
  saving.value = true;
  feedbackError.value = "";
  status.value = "";
  try {
    await manager.saveReplyFeedback(
      props.sessionId,
      props.message.id,
      comment.value.trim(),
    );
    editing.value = false;
    saved.value = true;
    status.value = "提交成功，感谢您的反馈";
    void MessagePlugin.success(status.value);
  } catch (e) {
    feedbackError.value = errorText(e);
  } finally {
    saving.value = false;
  }
}
async function branch() {
  if (branching.value || props.branchDisabled) return;
  branching.value = true;
  error.value = "";
  menu.value = false;
  try {
    emit(
      "branched",
      await manager.addSessionBranch(props.sessionId, props.message.id),
    );
  } catch (e) {
    error.value = errorText(e);
  } finally {
    branching.value = false;
  }
}
</script>
<template>
  <div class="reply-actions" aria-label="回复操作">
    <button
      type="button"
      title="复制回答"
      aria-label="复制回答"
      @click="copyAnswer"
    >
      <Check v-if="status === '已复制'" :size="17" /><Copy v-else :size="17" />
    </button>
    <button
      type="button"
      title="吐槽回答"
      aria-label="吐槽回答"
      :aria-pressed="submitted"
      :class="{ 'feedback-submitted': submitted }"
      @click="openFeedback"
    >
      <ThumbsDown :size="17" />
    </button>
    <div class="reply-more" @focusout="closeMenu">
      <button
        type="button"
        title="更多回复操作"
        aria-label="更多回复操作"
        :aria-expanded="menu"
        aria-haspopup="menu"
        :disabled="branching"
        @click="menu = !menu"
        @keydown.esc="menu = false"
      >
        <MoreHorizontal :size="18" />
      </button>
      <div
        v-if="menu"
        class="reply-action-menu"
        role="menu"
        @keydown.esc="menu = false"
      >
        <button
          type="button"
          role="menuitem"
          :disabled="branchDisabled || branching"
          @click="branch"
        >
          <GitBranch :size="17" />分支到新聊天
        </button>
      </div>
    </div>
    <time
      v-if="timestamp"
      :datetime="message.finished_at || message.created_at"
      >{{ timestamp }}</time
    >
    <span v-if="branching" role="status">正在创建分支…</span>
    <span v-else-if="status" role="status" class="reply-action-success"
      ><Check :size="14" />{{ status }}</span
    >
    <span v-if="error" role="alert" class="reply-action-error">{{
      error
    }}</span>
  </div>
  <t-dialog
    v-model:visible="editing"
    header="吐槽这条回答"
    role="dialog"
    aria-modal="true"
    aria-label="吐槽这条回答"
    :footer="false"
    :close-on-overlay-click="!saving"
    :close-btn="!saving"
    :close-on-esc-keydown="!saving"
  >
    <form class="reply-feedback-form" @submit.prevent="saveFeedback">
      <p>请描述这条回答的问题，反馈将发送给管理员。</p>
      <label :for="`reply-feedback-${message.id}`">具体问题</label>
      <textarea
        :id="`reply-feedback-${message.id}`"
        v-model="comment"
        rows="5"
        :disabled="saving"
        placeholder="例如：数据有误、遗漏要求、结论缺少依据…"
        required
      />
      <p v-if="feedbackError" role="alert" class="reply-action-error">
        {{ feedbackError }}
      </p>
      <div class="reply-feedback-buttons">
        <t-button variant="outline" :disabled="saving" @click="editing = false"
          >取消</t-button
        ><t-button type="submit" :loading="saving" :disabled="!comment.trim()"
          >提交反馈</t-button
        >
      </div>
    </form>
  </t-dialog>
</template>
<style scoped>
.reply-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 14px;
  color: var(--muted);
  font-size: 12px;
}
.reply-actions button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 5px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: inherit;
  cursor: pointer;
}
.reply-actions button:hover {
  background: var(--hover);
  color: var(--text);
}
.reply-actions .feedback-submitted,
.reply-actions .feedback-submitted:hover {
  color: var(--danger);
  background: var(--danger-soft);
}
.reply-action-success {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text);
}
.reply-actions button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.reply-actions button:focus-visible {
  outline: 2px solid var(--annotation-blue);
  outline-offset: 2px;
}
.reply-more {
  position: relative;
}
.reply-action-menu {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  padding: 5px;
  z-index: 5;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: var(--shadow);
  white-space: nowrap;
  color: var(--text);
}
.reply-action-menu button {
  gap: 8px;
  padding: 8px 10px;
  font: inherit;
}
.reply-feedback-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.reply-feedback-form p {
  margin: 0;
  color: var(--muted);
}
.reply-feedback-form textarea {
  resize: vertical;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
.reply-feedback-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.reply-actions .reply-action-error,
.reply-feedback-form .reply-action-error {
  color: var(--danger);
}
</style>
