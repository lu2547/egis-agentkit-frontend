<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from "vue";
import {
  useSkillChoices,
  type SkillChoicePurpose,
} from "../../composables/useSkillChoices";
import type { Resource } from "../../types/api";
const props = withDefaults(
  defineProps<{
    modelValue: string[];
    purpose?: SkillChoicePurpose;
    keyMode?: "id" | "version";
    disabled?: boolean;
    max?: number;
    placeholder?: string;
    multiple?: boolean;
  }>(),
  { purpose: "usable", keyMode: "version", multiple: true },
);
const emit = defineEmits<{
  "update:modelValue": [value: string[]];
  resources: [resources: Resource[]];
}>();
const choices = useSkillChoices(
  computed(() => props.modelValue),
  props.purpose,
  props.keyMode,
);
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let query = "";
function search(value: string) {
  query = value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void choices.search(value), 200);
}
watch(
  () => props.modelValue,
  () => void choices.loadSelected(),
  { immediate: true, deep: true },
);
watch(choices.resources, (resources) => emit("resources", resources), {
  deep: true,
});
onMounted(() => void choices.search(""));
onUnmounted(() => {
  clearTimeout(searchTimer);
  choices.dispose();
});
</script>
<template>
  <t-select
    :value="multiple ? modelValue : modelValue[0] || ''"
    :multiple="multiple"
    clearable
    filterable
    :filter="() => true"
    :max="max"
    :disabled="disabled"
    :loading="choices.loading.value"
    :options="choices.options.value"
    :placeholder="placeholder || '搜索并选择技能'"
    :popup-props="{ placement: 'top-left' }"
    @input-change="search"
    @change="
      emit(
        'update:modelValue',
        Array.isArray($event)
          ? ($event as string[])
          : $event
            ? [String($event)]
            : [],
      )
    "
  />
  <div v-if="choices.error.value" class="error" role="alert">
    {{ choices.error.value }}
    <t-button size="small" variant="text" @click="choices.search(query)"
      >重新加载技能</t-button
    >
  </div>
  <t-button
    v-if="choices.hasMore.value"
    size="small"
    variant="text"
    :loading="choices.loading.value"
    :disabled="disabled"
    @click="choices.loadMore"
    >加载更多技能</t-button
  >
</template>
