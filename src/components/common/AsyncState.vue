<script setup lang="ts">
defineProps<{
  loading?: boolean;
  error?: string;
  empty?: boolean;
  emptyTitle?: string;
  emptyText?: string;
}>();
defineEmits<{ retry: [] }>();
</script>
<template>
  <div v-if="loading" class="empty">
    <t-loading size="small" text="正在加载" />
  </div>
  <div v-else-if="error" class="empty">
    <div class="error">{{ error }}</div>
    <t-button variant="outline" @click="$emit('retry')">重新加载</t-button>
  </div>
  <div v-else-if="empty" class="empty">
    <h3>{{ emptyTitle || "暂无内容" }}</h3>
    <p>{{ emptyText || "这里会显示你可访问的内容。" }}</p>
  </div>
  <slot v-else />
</template>
