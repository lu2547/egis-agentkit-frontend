<script setup lang="ts">
import { ref } from "vue";
import { GripVertical, Pencil, Send, Trash2, Check, X } from "lucide-vue-next";
import type { SteeringDraft } from "../../composables/useSteeringQueue";
import { isProjectFileReference } from "../../domain/previewReferences";

const props = defineProps<{
  items: SteeringDraft[];
  sending: boolean;
  disabled?: boolean;
  blockedReason?: string;
  maxTextLength?: number;
}>();
const emit = defineEmits<{
  send: [ids: string[]];
  edit: [id: string, text: string];
  remove: [id: string];
  move: [id: string, index: number];
}>();
const editing = ref(""),
  text = ref("");
function edit(item: SteeringDraft) {
  editing.value = item.id;
  text.value = item.text;
}
function save() {
  if (
    text.value.trim() ||
    props.items.some(
      (item) =>
        item.id === editing.value &&
        (item.references.length || item.annotations.length),
    )
  ) {
    emit("edit", editing.value, text.value);
    editing.value = "";
  }
}
function draftLabel(item: SteeringDraft) {
  const files = item.references.filter(isProjectFileReference);
  return item.text || files.map((file) => file.name).join("、") || "预览批注";
}
function drop(event: DragEvent, index: number) {
  event.preventDefault();
  const id = event.dataTransfer?.getData("text/plain");
  if (id && !props.sending) emit("move", id, index);
}
</script>
<template>
  <div v-if="items.length" class="steering-queue" aria-label="待发引导">
    <p v-if="blockedReason" class="steering-unavailable" role="status">{{ blockedReason }}</p>
    <div
      v-for="(item, index) in items"
      :key="item.id"
      class="steering-queue-row"
      @dragover.prevent
      @drop="drop($event, index)"
    >
      <button
        class="steering-grip"
        type="button"
        :aria-label="`移动第 ${index + 1} 条引导`"
        title="拖动调整顺序，或按 Alt + 上下方向键"
        :draggable="!sending"
        :disabled="sending"
        @dragstart="$event.dataTransfer?.setData('text/plain', item.id)"
        @keydown.alt.up.prevent="$emit('move', item.id, index - 1)"
        @keydown.alt.down.prevent="$emit('move', item.id, index + 1)"
      >
        <GripVertical :size="16" />
      </button>
      <div class="steering-draft-content">
        <textarea
          v-if="editing === item.id"
          v-model="text"
          :aria-label="`第 ${index + 1} 条引导内容`"
          :maxlength="maxTextLength"
          rows="2"
          @keydown.enter.exact.prevent="save"
          @keydown.esc.prevent="editing = ''"
        />
        <template v-else
          ><p>{{ draftLabel(item) }}</p>
          <small v-if="item.references.length || item.annotations.length"
            >{{
              item.references.length + item.annotations.length
            }}
            项引用或批注</small
          ></template
        >
        <small v-if="item.notice" role="status">{{ item.notice }}</small>
        <small v-if="item.status === 'sending'" role="status"
          >等待模型注入</small
        >
        <small
          v-if="item.error || item.status === 'failed'"
          class="steering-retry"
          role="status"
          >{{ item.error || "注入失败，可编辑后重试" }}</small
        >
      </div>
      <div class="steering-draft-actions">
        <template v-if="editing === item.id">
          <button type="button" aria-label="保存引导修改" @click="save">
            <Check :size="18" />
          </button>
          <button type="button" aria-label="取消引导修改" @click="editing = ''">
            <X :size="18" />
          </button>
        </template>
        <template v-else>
          <button
            type="button"
            :aria-label="`发送第 ${index + 1} 条引导`"
            :title="blockedReason || '引导会话，消息将被发出但模型不会中断'"
            :disabled="disabled || !!blockedReason || sending || item.status === 'sending'"
            @click="$emit('send', [item.id])"
          >
            <Send :size="18" />
          </button>
          <button
            type="button"
            :aria-label="`编辑第 ${index + 1} 条引导`"
            :disabled="sending || item.status === 'sending'"
            @click="edit(item)"
          >
            <Pencil :size="18" />
          </button>
          <button
            type="button"
            :aria-label="`删除第 ${index + 1} 条引导`"
            :disabled="sending || item.status === 'sending'"
            @click="$emit('remove', item.id)"
          >
            <Trash2 :size="18" />
          </button>
        </template>
      </div>
    </div>
    <button
      v-if="items.length > 1"
      class="steering-send-all"
      type="button"
      :disabled="disabled || !!blockedReason || sending || !!editing"
      @click="
        $emit(
          'send',
          items.map((item) => item.id),
        )
      "
    >
      {{ sending ? "正在发送" : "全部引导" }}
    </button>
  </div>
</template>
<style scoped src="../../styles/components/steering-queue.css"></style>
