<script setup lang="ts">
import { ChevronLeft, ChevronRight } from "lucide-vue-next";

defineProps<{
  label: string;
  page: number;
  hasNext?: boolean;
  disabled?: boolean;
}>();
const emit = defineEmits<{ change: [page: number] }>();
</script>

<template>
  <nav class="admin-pagination" :aria-label="`${label}分页`">
    <span class="muted" aria-live="polite">第 {{ page }} 页</span>
    <t-button
      size="small"
      variant="outline"
      :disabled="disabled || page <= 1"
      @click="emit('change', page - 1)"
    >
      <template #icon><ChevronLeft :size="16" aria-hidden="true" /></template>
      上一页
    </t-button>
    <t-button
      size="small"
      variant="outline"
      :disabled="disabled || !hasNext"
      @click="emit('change', page + 1)"
    >
      下一页
      <ChevronRight :size="16" aria-hidden="true" />
    </t-button>
  </nav>
</template>

<style scoped>
.admin-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.admin-pagination > .muted {
  margin-inline-end: 4px;
}
</style>
