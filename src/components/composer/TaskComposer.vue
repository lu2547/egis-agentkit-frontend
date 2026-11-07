<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { manager } from "../../api/manager";
import AttachmentList from "./AttachmentList.vue";
import ContextPicker from "./ContextPicker.vue";
import ModelSelector from "./ModelSelector.vue";
import ComposerMenu from "./ComposerMenu.vue";
import PermissionModePicker from "./PermissionModePicker.vue";
import AppIcon from "../common/AppIcon.vue";
import CatalogAvatar from "../common/CatalogAvatar.vue";
import type {
  Definition,
  ModelOption,
  PermissionModeOption,
  Resource,
} from "../../types/api";
import { definitionName } from "../../types/api";
const props = defineProps<{
  modelValue: string;
  definitions?: Definition[];
  selected?: Definition | null;
  selectedLabel?: string;
  selectedAvatar?: unknown;
  models?: ModelOption[];
  modelKey?: string;
  permissionMode?: string;
  permissionOptions?: PermissionModeOption[];
  settingsDisabled?: boolean;
  running?: boolean;
  interrupting?: boolean;
  pending?: boolean;
  disabled?: boolean;
  compact?: boolean;
  isPersonal?: boolean;
  attachments?: File[];
}>();
const emit = defineEmits<{
  "update:modelValue": [value: string];
  "update:modelKey": [value: string];
  "update:permissionMode": [value: string];
  select: [definition: Definition | null];
  submit: [];
  stop: [];
  attach: [files: File[]];
  removeAttachment: [index: number];
}>();
const fileInput = ref<HTMLInputElement | null>(null);
function choose(event: Event) {
  const input = event.target as HTMLInputElement;
  emit("attach", Array.from(input.files || []));
  input.value = "";
}
const composing = ref(false);
const canManageResources = computed(
  () => props.isPersonal || (!props.compact && !props.selected),
);
const contextDismissed = ref(false);
const contextIndex = ref(0);
const contextSkills = ref<Resource[]>([]);
let contextRequest = 0;
const contextToken = computed(() => {
  if (contextDismissed.value || composing.value) return null;
  const match = props.modelValue.match(/(?:^|\s)([@/])([^\s@/]*)$/);
  return match
    ? {
        trigger: match[1] as "@" | "/",
        query: match[2] || "",
        start: props.modelValue.length - (match[2]?.length || 0) - 1,
      }
    : null;
});
const contextOptions = computed(() => {
  const token = contextToken.value;
  if (!token) return [];
  const options =
    token.trigger === "@"
      ? (props.definitions || [])
          .filter((d) => d.is_usable)
          .map((d) => ({
            id: `${d.id}:${d.resource_view_type}`,
            name: definitionName(d),
            detail: d.payload.description,
            kind: "expert" as const,
            definition: d,
          }))
      : contextSkills.value
          .filter((r) => r.is_usable && r.is_installed && r.is_enabled)
          .map((r) => ({
            id: r.resource_id,
            name: r.display_name,
            detail: r.description,
            kind: "skill" as const,
            definition: undefined,
          }));
  const query = token.query.toLocaleLowerCase();
  return options.filter((option) =>
    `${option.name} ${option.detail}`.toLocaleLowerCase().includes(query),
  );
});
watch(
  () => props.modelValue,
  () => {
    contextDismissed.value = false;
    contextIndex.value = 0;
  },
);
watch(
  () => contextToken.value?.trigger,
  async (trigger) => {
    const request = ++contextRequest;
    contextSkills.value = [];
    if (trigger !== "/" || !canManageResources.value) return;
    try {
      const result = await manager.resources("skills");
      if (request === contextRequest) contextSkills.value = result.items;
    } catch {
      /* Resource picker reports errors when opened explicitly. */
    }
  },
);
function chooseContext(index: number) {
  const option = contextOptions.value[index],
    token = contextToken.value;
  if (!option || !token) return;
  if (option.definition) emit("select", option.definition);
  const text = option.kind === "skill" ? `请使用${option.name}技能 ` : "";
  emit("update:modelValue", props.modelValue.slice(0, token.start) + text);
  contextDismissed.value = true;
}
function keydown(e: KeyboardEvent) {
  if (e.isComposing || composing.value) return;
  if (e.key === "Escape" && contextToken.value) {
    contextDismissed.value = true;
    return;
  }
  if (
    contextToken.value &&
    contextOptions.value.length &&
    !e.shiftKey &&
    ["ArrowUp", "ArrowDown", "Enter", "Tab"].includes(e.key)
  ) {
    e.preventDefault();
    if (e.key === "ArrowUp" || e.key === "ArrowDown")
      contextIndex.value =
        (contextIndex.value +
          (e.key === "ArrowDown" ? 1 : -1) +
          contextOptions.value.length) %
        contextOptions.value.length;
    else chooseContext(contextIndex.value);
    return;
  }
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !composing.value) {
    e.preventDefault();
    send();
  }
}
function send() {
  if (
    props.modelValue.trim() &&
    !props.disabled &&
    !props.pending &&
    !props.running
  )
    emit("submit");
}
</script>
<template>
  <section class="composer" :class="{ compact }">
    <ContextPicker
      v-if="contextToken"
      :options="contextOptions"
      :active-index="contextIndex"
      :trigger="contextToken.trigger"
      @select="chooseContext"
      @highlight="contextIndex = $event"
    />
    <AttachmentList
      :files="attachments || []"
      :disabled="pending || running"
      @remove="$emit('removeAttachment', $event)"
    /><input
      ref="fileInput"
      type="file"
      multiple
      hidden
      @change="choose"
    /><t-textarea
      :value="modelValue"
      :autosize="{ minRows: 2, maxRows: 9 }"
      :disabled="disabled"
      placeholder="今天帮你做些什么？@ 添加上下文，/调用技能与指令。"
      :maxlength="32000"
      @update:value="(value: string) => $emit('update:modelValue', value)"
      @keydown="keydown"
      @compositionstart="composing = true"
      @compositionend="composing = false"
    />
    <div class="composer-footer">
      <div class="composer-tools">
        <ComposerMenu
          :definitions="definitions"
          :selected="selected"
          :can-manage-resources="canManageResources"
          :permission-mode="permissionMode"
          :permission-options="permissionOptions"
          :settings-disabled="settingsDisabled"
          :disabled="pending || running || disabled"
          @add-files="fileInput?.click()"
          @select="$emit('select', $event)"
          @update:permission-mode="$emit('update:permissionMode', $event)"
        />
        <PermissionModePicker
          :model-value="permissionMode || 'default'"
          :options="permissionOptions || []"
          :disabled="settingsDisabled"
          @update:model-value="$emit('update:permissionMode', $event)"
        />
        <div
          v-if="selected || selectedLabel"
          class="selected"
          aria-label="当前专家"
          :title="selected ? definitionName(selected) : selectedLabel"
        >
          <img
            v-if="isPersonal"
            class="personal-logo"
            src="/brand/sheep-head-v1.png"
            alt=""
          />
          <CatalogAvatar
            v-else
            :avatar="selected?.payload.avatar || selectedAvatar"
            :name="selected ? definitionName(selected) : selectedLabel"
          />
          <span class="selected-name">{{
            selected ? definitionName(selected) : selectedLabel
          }}</span
          ><button
            v-if="selected && definitions"
            class="plain"
            aria-label="移除专家"
            @click="$emit('select', null)"
          >
            <AppIcon name="close" :size="12" />
          </button>
        </div>
      </div>
      <ModelSelector
        :model="modelKey || ''"
        :models="models || []"
        :disabled="settingsDisabled"
        @update:model="$emit('update:modelKey', $event)"
      />
      <button
        v-if="running"
        class="send-button stop-button"
        :disabled="interrupting"
        :aria-label="interrupting ? '正在停止' : '停止生成'"
        @click="$emit('stop')"
      >
        <span class="stop-glyph" aria-hidden="true"></span></button
      ><button
        v-else
        class="send-button"
        :disabled="!modelValue.trim() || pending || disabled"
        aria-label="发送消息"
        @click="send"
      >
        <t-loading v-if="pending" size="small" /><AppIcon
          v-else
          name="send"
          :size="19"
        />
      </button>
    </div>
  </section>
  <p v-if="!compact" class="composer-note">内容由 AI 生成，请核实重要信息</p>
</template>
<style scoped src="../../styles/components/task-composer.css"></style>
