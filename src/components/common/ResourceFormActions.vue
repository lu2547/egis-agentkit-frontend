<script setup lang="ts">
defineProps<{ submitLabel: string; pending?: boolean; disabled?: boolean }>();
defineEmits<{ cancel: [] }>();
</script>

<template>
  <div class="form-actions">
    <t-button
      type="button"
      theme="default"
      variant="outline"
      @click="$emit('cancel')"
      >取消</t-button
    >
    <t-button
      type="submit"
      theme="primary"
      :loading="pending"
      :disabled="disabled"
      >{{ submitLabel }}</t-button
    >
  </div>
</template>
