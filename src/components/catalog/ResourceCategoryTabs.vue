<script setup lang="ts">
defineProps<{ categories: string[]; modelValue: string }>();
defineEmits<{ "update:modelValue": [value: string] }>();
</script>
<template>
  <div class="categories" role="tablist" aria-label="资源分类">
    <button
      v-for="category in ['全部', ...categories]"
      :key="category"
      role="tab"
      :aria-selected="modelValue === category"
      :class="{ selected: modelValue === category }"
      @click="$emit('update:modelValue', category)"
    >
      {{ category }}
    </button>
  </div>
</template>
<style scoped src="../../styles/components/resource-category-tabs.css"></style>
