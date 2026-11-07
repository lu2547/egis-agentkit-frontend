<script setup lang="ts">
import { ref, watch, onUnmounted } from "vue";
import { manager } from "../../api/manager";
import type { WorkspaceFile } from "../../types/api";
import ArtifactCard from "./ArtifactCard.vue";
const props = defineProps<{
  sessionId: string;
  projectId?: string;
  revision: string;
}>();
defineEmits<{ open: [path: string]; "view-all": [] }>();
const files = ref<WorkspaceFile[]>([]);
let controller: AbortController | null = null;
let loadedSession = "";
watch(
  () => [props.projectId || props.sessionId, props.revision],
  async () => {
    controller?.abort();
    if (loadedSession !== (props.projectId || props.sessionId)) {
      files.value = [];
      loadedSession = props.projectId || props.sessionId;
    }
    if (!props.sessionId && !props.projectId) return;
    controller = new AbortController();
    const signal = controller.signal;
    try {
      const result = await manager.files(
        props.sessionId,
        "artifacts",
        "",
        signal,
        true,
        props.projectId,
      );
      if (!signal.aborted)
        files.value = result.items.filter((f) => !f.is_directory);
    } catch {
      if (!signal.aborted) files.value = [];
    }
  },
  { immediate: true },
);
onUnmounted(() => controller?.abort());
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
      查看所有产物 ({{ files.length }}) <span aria-hidden="true">›</span>
    </button>
  </section>
</template>
<style scoped src="./ArtifactList.css"></style>
