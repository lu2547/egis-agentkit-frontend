<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";
import { createComposerPager } from "../../domain/composerOptions";
import PreviewReferenceList from "./PreviewReferenceList.vue";
import TextAnnotationList from "./TextAnnotationList.vue";
import type { TextAnnotation } from "../../domain/textAnnotations";
import type {
  ChatReference,
  ProjectFileReference,
} from "../../domain/previewReferences";
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
const props = withDefaults(
  defineProps<{
    modelValue: string;
    sessionId?: string;
    projectId?: string;
    fileRevision?: number;
    definitions?: Definition[];
    selectedLabel?: string;
    models?: ModelOption[];
    modelKey?: string;
    permissionMode?: string;
    permissionOptions?: PermissionModeOption[];
    settingsDisabled?: boolean;
    permissionDisabled?: boolean;
    running?: boolean;
    steeringEnabled?: boolean;
    maxTextLength?: number;
    interrupting?: boolean;
    pending?: boolean;
    disabled?: boolean;
    compact?: boolean;
    isPersonal?: boolean;
    canInviteExperts?: boolean;
    attachments?: File[];
    references?: ChatReference[];
    referenceError?: string;
    annotations?: TextAnnotation[];
  }>(),
  { permissionDisabled: undefined },
);
const emit = defineEmits<{
  "update:modelValue": [value: string];
  "update:modelKey": [value: string];
  "update:permissionMode": [value: string];
  select: [definition: Definition];
  submit: [];
  queue: [];
  stop: [];
  attach: [files: File[]];
  removeAttachment: [index: number];
  addFileReference: [value: ProjectFileReference];
  openReference: [value: ChatReference];
  removeReference: [id: string];
  updateAnnotation: [id: string, comment: string];
  removeAnnotation: [id: string];
  locateAnnotation: [value: TextAnnotation];
}>();
const fileInput = ref<HTMLInputElement | null>(null);
const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform);
const sendShortcutLabel = isMac ? "⌘ + Enter" : "Alt + Enter";
function textareaKeydown(_value: unknown, context: { e: KeyboardEvent }) {
  keydown(context.e);
}
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
    const agents = await manager.definitions("agents");
    fallbackDefinitions.value = agents.items;
  } catch (error) {
    picker.state.error = errorText(error);
  }
});
function focusComposer() {
  nextTick(() => composerElement.value?.querySelector("textarea")?.focus());
}
const composing = ref(false);
const canManageResources = computed(() => !!props.isPersonal);
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
  if (option.definition) {
    if (!props.canInviteExperts) return;
    emit("select", option.definition);
  }
  if (option.kind === "file") {
    if (!props.projectId || !option.reference) return;
    emit("addFileReference", {
      kind: "file",
      id: option.id,
      projectId: props.projectId,
      path: option.reference,
      name: option.display_name || option.name,
    });
  }
  const text =
    option.kind === "file"
      ? ""
      : (option.insert_text ??
        (option.kind === "skill" ? `请使用${option.name}技能 ` : ""));
  emit("update:modelValue", props.modelValue.slice(0, token.start) + text);
  contextDismissed.value = true;
  focusComposer();
}
function keydown(e: KeyboardEvent) {
  if (e.isComposing || composing.value) return;
  const sendShortcut =
    e.key === "Enter" &&
    !e.shiftKey &&
    !e.ctrlKey &&
    (isMac ? e.metaKey && !e.altKey : e.altKey && !e.metaKey);
  if (sendShortcut) {
    e.preventDefault();
    send();
    return;
  }
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
}
function send() {
  if (
    (props.modelValue.trim() ||
      props.annotations?.length ||
      props.references?.length) &&
    !props.disabled &&
    !props.pending
  )
    if (props.running && props.steeringEnabled) emit("queue");
    else if (!props.running) emit("submit");
}
defineExpose({ focusComposer });
</script>
<template>
  <section ref="composerElement" class="composer" :class="{ compact }">
    <slot name="queue" />
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
    <PreviewReferenceList
      :references="references || []"
      removable
      :disabled="pending || (running && !steeringEnabled)"
      @open="$emit('openReference', $event)"
      @remove="$emit('removeReference', $event)"
    />
    <TextAnnotationList
      :annotations="annotations || []"
      editable
      :disabled="pending || running"
      @update="(id, comment) => $emit('updateAnnotation', id, comment)"
      @remove="$emit('removeAnnotation', $event)"
      @locate="$emit('locateAnnotation', $event)"
    />
    <p v-if="referenceError" role="alert" class="error">{{ referenceError }}</p>
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
      :placeholder="
        running && steeringEnabled
          ? `继续补充要求，${sendShortcutLabel} 加入引导队列`
          : '今天帮你做些什么？@ 添加上下文，/调用技能与指令。'
      "
      :maxlength="maxTextLength || 32000"
      @update:value="(value: string) => $emit('update:modelValue', value)"
      @keydown="textareaKeydown"
      @compositionstart="composing = true"
      @compositionend="composing = false"
    />
    <div class="composer-footer">
      <div class="composer-tools">
        <ComposerMenu
          :definitions="availableDefinitions"
          :can-invite-experts="canInviteExperts"
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
          :disabled="permissionDisabled ?? settingsDisabled"
          @update:model-value="$emit('update:permissionMode', $event)"
        />
        <div
          v-if="selectedLabel"
          class="selected"
          aria-label="会话助手"
          :title="selectedLabel"
        >
          <img
            v-if="isPersonal"
            class="personal-logo"
            src="/brand/sheep-head-v1.png"
            alt=""
          />
          <CatalogAvatar v-else :name="selectedLabel" />
          <span class="selected-name">{{ selectedLabel }}</span>
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
        v-if="running && steeringEnabled"
        class="plain queue-add-button"
        :disabled="
          (!modelValue.trim() && !annotations?.length && !references?.length) ||
          pending ||
          disabled
        "
        aria-label="加入引导队列"
        title="加入待发引导"
        @click="send()"
      >
        <AppIcon name="send" :size="19" />
      </button>
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
        :disabled="
          (!modelValue.trim() && !annotations?.length && !references?.length) ||
          pending ||
          disabled
        "
        aria-label="发送消息"
        :title="`${sendShortcutLabel} 发送`"
        @click="send()"
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
