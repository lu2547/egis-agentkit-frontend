<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
  <header class="admin-section-header">
    <h2>{{ title }}</h2>
    <div v-if="$slots.default" class="section-actions">
      <slot />
    </div>
  </header>
</template>

<style scoped>
.admin-section-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 48px;
  margin-bottom: 20px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border);
}
.admin-section-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.35;
}
.section-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.section-actions :slotted(a) {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
}
.section-actions :slotted(a:hover) {
  background: var(--hover);
}
</style>
