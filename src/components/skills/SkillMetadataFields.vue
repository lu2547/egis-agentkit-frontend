<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{
  category: string;
  categories?: string[];
}>();
defineEmits<{
  "update:category": [value: string];
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
  <p class="muted">头像由 AI 自动生成，生成失败时使用技能名首字。</p>
</template>
