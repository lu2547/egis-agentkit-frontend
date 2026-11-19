<script setup lang="ts">
defineProps<{ label: string; minWidth?: number }>();
</script>

<template>
  <div
    class="admin-table"
    role="region"
    :aria-label="label"
    :style="
      minWidth ? { '--admin-table-min-width': `${minWidth}px` } : undefined
    "
    tabindex="0"
  >
    <slot />
  </div>
</template>

<style scoped>
.admin-table {
  max-width: 100%;
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--td-bg-color-container);
}

.admin-table :deep(.t-table),
.admin-table :deep(table) {
  min-width: var(--admin-table-min-width, 560px);
}

.admin-table :deep(table) {
  width: 100%;
  border-collapse: collapse;
  color: var(--td-text-color-primary);
  font: var(--td-font-body-medium);
  text-align: start;
}

.admin-table :deep(th),
.admin-table :deep(td) {
  padding: var(--td-comp-paddingTB-l) var(--td-comp-paddingLR-l);
  border-bottom: 1px solid var(--border);
  overflow-wrap: anywhere;
}

.admin-table :deep(th) {
  background: var(--surface);
  color: var(--text);
  font-weight: 600;
  text-align: start;
  white-space: nowrap;
}

.admin-table :deep(tbody tr:hover) {
  background-color: var(--td-bg-color-container-hover);
}

.admin-table :deep(tbody tr:last-child td) {
  border-bottom: 0;
}
</style>
