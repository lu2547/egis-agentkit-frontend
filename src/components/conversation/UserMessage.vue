<script setup lang="ts">
import type { Msg } from "@agentscope-ai/agentscope/message";
import { computed, nextTick, ref } from "vue";
import { Check, Copy, Pencil } from "lucide-vue-next";
import { steeringState } from "../../domain/steering";
import {
  canSendUserMessage,
  userMessageText,
} from "../../domain/userMessageEditing";
import { errorText } from "../../api/http";
import PreviewReferenceList from "../composer/PreviewReferenceList.vue";
import TextAnnotationList from "../composer/TextAnnotationList.vue";
import {
  getTextAnnotations,
  type TextAnnotation,
} from "../../domain/textAnnotations";
import {
  getMessageProjectFiles,
  getMessageReferences,
  type ChatReference,
} from "../../domain/previewReferences";
const props = defineProps<{
  message: Msg;
  editDisabled?: boolean;
  resend?: (message: Msg, text: string) => Promise<boolean>;
  resendError?: string;
}>();
const references = computed(() => [
  ...getMessageProjectFiles(props.message),
  ...getMessageReferences(props.message),
]);
const annotations = computed(() => getTextAnnotations(props.message));
const prompt = computed(() => userMessageText(props.message));
const editing = ref(false),
  pending = ref(false),
  draft = ref("");
const error = ref(""),
  status = ref("");
const textarea = ref<HTMLTextAreaElement | null>(null);
const timestamp = computed(() => {
  const date = new Date(props.message.created_at);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
});
async function copyMessage() {
  error.value = "";
  status.value = "";
  try {
    await navigator.clipboard.writeText(prompt.value);
    status.value = "已复制";
  } catch {
    error.value = "无法访问剪贴板，请允许浏览器复制后重试。";
  }
}
async function startEditing() {
  if (props.editDisabled || !props.resend) return;
  draft.value = prompt.value;
  error.value = "";
  status.value = "";
  editing.value = true;
  await nextTick();
  textarea.value?.focus();
}
async function submitEdit() {
  if (
    pending.value ||
    props.editDisabled ||
    !props.resend ||
    !canSendUserMessage(props.message, draft.value)
  )
    return;
  pending.value = true;
  error.value = "";
  try {
    const accepted = await props.resend(props.message, draft.value);
    if (accepted) editing.value = false;
    else {
      await nextTick();
      error.value = props.resendError || "消息未发送，请稍后重试。";
      textarea.value?.focus();
    }
  } catch (e) {
    error.value = errorText(e);
  } finally {
    pending.value = false;
  }
}
defineEmits<{
  reference: [value: ChatReference];
  annotation: [value: TextAnnotation];
}>();
</script>
<template>
  <article class="user-message" :class="{ 'is-editing': editing }">
    <div class="user-message-bubble">
      <span v-if="steeringState(message)" class="steering-status"
        >引导 ·
        {{
          {
            queued: "排队中",
            steering: "引导中",
            received: "已接收",
            failed: "失败",
          }[steeringState(message)!]
        }}</span
      >
      <TextAnnotationList
        :annotations="annotations"
        @locate="$emit('annotation', $event)"
      />
      <PreviewReferenceList
        :references="references"
        @open="$emit('reference', $event)"
      />
      <form
        v-if="editing"
        class="user-message-editor"
        @submit.prevent="submitEdit"
      >
        <textarea
          ref="textarea"
          v-model="draft"
          aria-label="编辑消息内容"
          :disabled="pending"
          rows="4"
          @keydown.esc.prevent="!pending && (editing = false)"
        />
        <p class="user-message-edit-note">
          编辑后将从此处重新开始对话，已生成的产物会保留。
        </p>
        <p v-if="error" class="user-message-error" role="alert">{{ error }}</p>
        <div class="user-message-edit-actions">
          <button type="button" :disabled="pending" @click="editing = false">
            取消
          </button>
          <button
            type="submit"
            class="user-message-send"
            :disabled="
              pending || editDisabled || !canSendUserMessage(message, draft)
            "
          >
            {{ pending ? "发送中…" : "发送" }}
          </button>
        </div>
      </form>
      <p v-else-if="prompt">{{ prompt }}</p>
      <template v-for="block in message.content" :key="block.id">
        <span
          v-if="
            block.type === 'data' &&
            !references.some((ref) => ref.id === block.id)
          "
          class="badge"
          >{{ block.name || "附件" }}</span
        >
      </template>
    </div>
    <div v-if="!editing" class="user-message-actions">
      <time :datetime="message.created_at">{{ timestamp }}</time>
      <button
        type="button"
        aria-label="复制消息"
        title="复制消息"
        @click="copyMessage"
      >
        <Check v-if="status" :size="14" /><Copy v-else :size="14" />
      </button>
      <button
        type="button"
        aria-label="编辑消息"
        title="编辑消息"
        :disabled="editDisabled || !resend"
        @click="startEditing"
      >
        <Pencil :size="14" />
      </button>
      <span v-if="status" class="user-message-status" role="status">{{
        status
      }}</span>
    </div>
    <p v-if="error && !editing" class="user-message-error" role="alert">
      {{ error }}
    </p>
  </article>
</template>
<style scoped src="../../styles/components/user-message.css"></style>
