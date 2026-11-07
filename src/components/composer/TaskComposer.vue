<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";
import { createComposerPager } from "../../domain/composerOptions";
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
  ComposerCategory,
} from "../../types/api";
import { definitionName } from "../../types/api";
const props = defineProps<{
  modelValue: string;
  sessionId?: string;
  projectId?: string;
  fileRevision?: number;
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
const composerElement = ref<HTMLElement>();
const fallbackDefinitions = ref<Definition[]>([]);
const availableDefinitions = computed(
  () => props.definitions ?? fallbackDefinitions.value,
);
onMounted(async () => {
  if (props.definitions) return;
  try {
    const [agents, teams] = await Promise.all([
      manager.definitions("agents"),
      manager.definitions("teams"),
    ]);
    fallbackDefinitions.value = [...agents.items, ...teams.items];
  } catch (error) {
    picker.state.error = errorText(error);
  }
});
function focusComposer() {
  nextTick(() => composerElement.value?.querySelector("textarea")?.focus());
}
const composing = ref(false);
const canManageResources = computed(
  () => props.isPersonal || (!props.compact && !props.selected),
);
const contextDismissed = ref(false);
const contextSearch = ref("");
const contextCategory = ref<ComposerCategory>("context");
const picker = createComposerPager(manager.composerOptions);
const contextIndex = computed({
  get: () => picker.state.activeIndex,
  set: (value: number) => {
    picker.state.activeIndex = value;
  },
});
const contextOptions = computed(() => picker.state.items);
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
watch(
  () => props.modelValue,
  () => {
    contextDismissed.value = false;
    contextIndex.value = 0;
    contextSearch.value = contextToken.value?.query || "";
  },
  { immediate: true },
);
watch(
  () => contextToken.value?.trigger,
  (trigger) => {
    contextCategory.value = trigger === "/" ? "skills" : "context";
  },
  { flush: "sync", immediate: true },
);
watch(
  [
    () => contextToken.value?.trigger,
    contextCategory,
    contextSearch,
    () => props.sessionId,
    () => props.projectId,
    () => props.fileRevision,
    canManageResources,
  ],
  ([trigger]) => {
    void picker.reset(
      trigger &&
        !(contextCategory.value === "skills" && !canManageResources.value)
        ? {
            category: contextCategory.value,
            query: contextSearch.value,
            session_id: props.sessionId,
            project_id: props.projectId,
          }
        : null,
    );
  },
  { immediate: true },
);
onUnmounted(() => {
  void picker.reset(null);
});
function dismissContext() {
  contextDismissed.value = true;
  focusComposer();
}
function searchContext(value: string) {
  contextSearch.value = value;
  contextIndex.value = 0;
}
function chooseContext(index: number) {
  const option = contextOptions.value[index],
    token = contextToken.value;
  if (!option || !token) return;
  if (option.definition) emit("select", option.definition);
  const text =
    option.insert_text ??
    (option.kind === "skill"
      ? `请使用${option.name}技能 `
      : option.kind === "file"
        ? `【项目文件：${option.reference}】 `
        : "");
  emit("update:modelValue", props.modelValue.slice(0, token.start) + text);
  contextDismissed.value = true;
  focusComposer();
}
function keydown(e: KeyboardEvent) {
  if (e.isComposing || composing.value) return;
  if (e.key === "Escape" && contextToken.value) {
    e.preventDefault();
    dismissContext();
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
      void picker.move(e.key === "ArrowDown" ? 1 : -1);
    else chooseContext(contextIndex.value);
    return;
  }
  if (contextToken.value && e.key === "Enter") {
    e.preventDefault();
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
  <section ref="composerElement" class="composer" :class="{ compact }">
    <ContextPicker
      v-if="contextToken"
      :options="contextOptions"
      :active-index="contextIndex"
      :trigger="contextToken.trigger"
      :query="contextSearch"
      :loading="picker.state.loading"
      :error="picker.state.error"
      :category="contextCategory"
      :has-more="!!picker.state.cursor"
      @update:category="contextCategory = $event"
      @load-more="picker.loadMore()"
      @update:query="searchContext"
      @keydown="keydown"
      @dismiss="dismissContext"
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
          :definitions="availableDefinitions"
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
        <slot name="collaborators" />
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
  <slot name="footer">
    <p v-if="!compact" class="composer-note">内容由 AI 生成，请核实重要信息</p>
  </slot>
</template>
<style scoped src="../../styles/components/task-composer.css"></style>
