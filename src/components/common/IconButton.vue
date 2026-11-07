<script setup lang="ts">
defineProps<{ label: string; active?: boolean; disabled?: boolean }>();
</script>

<template>
  <button
    type="button"
    class="icon-button"
    :class="{ 'is-active': active }"
    :aria-label="label"
    :title="label"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>

<style scoped src="../../styles/components/IconButton.css"></style>
