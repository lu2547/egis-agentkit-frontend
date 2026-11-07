<script setup lang="ts">
import { computed } from "vue";
import FileTypeIcon from "../common/FileTypeIcon.vue";
import type { WorkspaceFile } from "../../types/api";
const props = defineProps<{ file: WorkspaceFile }>();
defineEmits<{ open: [] }>();
const size = computed(() =>
  props.file.size < 1024
    ? `${props.file.size} B`
    : `${(props.file.size / 1024).toFixed(1)} KB`,
);
</script>
<template>
  <button class="artifact-card" :title="file.name" @click="$emit('open')">
    <FileTypeIcon :name="file.name" :size="44" />
    <span class="artifact-info"
      ><strong>{{ file.name }}</strong
      ><small>{{ size }}</small></span
    >
  </button>
</template>
<style scoped src="./ArtifactCard.css"></style>
