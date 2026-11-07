<script setup lang="ts">
import AppIcon from "../common/AppIcon.vue";
import FileTypeIcon from "../common/FileTypeIcon.vue";
defineProps<{ files: File[]; disabled?: boolean }>();
defineEmits<{ remove: [index: number] }>();
</script>
<template>
  <div v-if="files.length" class="attachments">
    <span v-for="(file, index) in files" :key="`${file.name}-${index}`"
      ><FileTypeIcon :name="file.name" :size="22" /><span>{{ file.name }}</span
      ><small>{{ Math.ceil(file.size / 1024) }} KB</small
      ><button
        class="plain"
        :disabled="disabled"
        :aria-label="`移除 ${file.name}`"
        @click="$emit('remove', index)"
      >
        <AppIcon name="close" :size="12" /></button
    ></span>
  </div>
</template>
<style scoped src="../../styles/components/AttachmentList.css"></style>
