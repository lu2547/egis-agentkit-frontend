<script setup lang="ts">
defineProps<{ hasMore: boolean; loading: boolean; error: string }>();
defineEmits<{ loadMore: []; retry: [] }>();
</script>

<template>
  <div v-if="hasMore || error" class="catalog-load-more">
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <t-button
      v-if="error"
      variant="outline"
      size="small"
      @click="$emit('retry')"
      >重新加载</t-button
    >
    <t-button
      v-else
      variant="outline"
      size="small"
      :loading="loading"
      @click="$emit('loadMore')"
      >加载更多</t-button
    >
  </div>
</template>

<style scoped>
.catalog-load-more {
  margin-top: 20px;
  text-align: center;
  overflow-anchor: none;
}
</style>
