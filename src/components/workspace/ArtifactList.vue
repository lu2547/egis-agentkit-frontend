<script setup lang="ts">
import type { WorkspaceFile } from "../../types/api";
import ArtifactCard from "./ArtifactCard.vue";
defineProps<{ files: WorkspaceFile[] }>();
defineEmits<{ open: [path: string]; "view-all": [] }>();
</script>
<template>
  <section v-if="files.length" class="artifact-list">
    <div class="artifact-grid">
      <ArtifactCard
        v-for="file in files.slice(0, 6)"
        :key="file.path"
        :file="file"
        @open="$emit('open', file.path)"
      />
    </div>
    <button class="view-all" @click="$emit('view-all')">
      查看项目产物 <span aria-hidden="true">›</span>
    </button>
  </section>
</template>
<style scoped src="./ArtifactList.css"></style>
