<script setup lang="ts">
import { computed } from "vue";
import AvatarPicker from "../common/AvatarPicker.vue";
const props = defineProps<{
  category: string;
  avatar: string;
  categories?: string[];
}>();
defineEmits<{
  "update:category": [value: string];
  "update:avatar": [value: string];
}>();
const options = computed(() =>
  [
    ...new Set(
      [
        "办公协同",
        "研究分析",
        "内容创作",
        "数据分析",
        "软件研发",
        ...(props.categories || []),
        props.category,
      ].filter(Boolean),
    ),
  ].map((value) => ({ label: value, value })),
);
</script>
<template>
  <div v-field-label class="field">
    <label>分类</label
    ><t-select
      :value="category"
      :options="options"
      creatable
      filterable
      @change="(value: unknown) => $emit('update:category', String(value))"
    />
  </div>
  <div v-field-label class="field">
    <label>头像</label
    ><AvatarPicker
      :model-value="avatar"
      kind="skill"
      @update:model-value="$emit('update:avatar', $event)"
    />
  </div>
</template>
