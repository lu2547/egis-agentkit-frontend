<script setup lang="ts">
withDefaults(
  defineProps<{ tone?: "neutral" | "success" | "warning" | "danger" }>(),
  { tone: "neutral" },
);
</script>

<template>
  <span class="admin-status-badge" :data-tone="tone"><slot /></span>
</template>

<style scoped>
.admin-status-badge {
  --badge-accent: var(--muted);
  --badge-surface: var(--surface);
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  max-width: 100%;
  padding-inline: 8px;
  border: 1px solid
    color-mix(in srgb, var(--badge-accent) 38%, var(--badge-surface));
  border-radius: 999px;
  background: var(--badge-surface);
  color: color-mix(in srgb, var(--badge-accent) 65%, var(--text));
  font-size: 12px;
  font-weight: 500;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.admin-status-badge[data-tone="success"] {
  --badge-accent: var(--success);
  --badge-surface: var(--success-soft);
}

.admin-status-badge[data-tone="warning"] {
  --badge-accent: var(--warning);
  --badge-surface: var(--warning-soft);
}

.admin-status-badge[data-tone="danger"] {
  --badge-accent: var(--danger);
  --badge-surface: var(--danger-soft);
}
</style>
