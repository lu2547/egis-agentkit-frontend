<script setup lang="ts">
import { Bot, ChevronRight, LoaderCircle } from "lucide-vue-next";
import { computed } from "vue";
import type { CollaboratorProgress } from "../../types/api";

const props = defineProps<{
  progress: CollaboratorProgress;
  stage: "started" | "finished";
  expanded?: boolean;
}>();
defineEmits<{ open: [workerId: string] }>();
const active = computed(
  () =>
    props.stage === "started" &&
    ["queued", "running"].includes(props.progress.status),
);
const labels: Record<CollaboratorProgress["status"], string> = {
  queued: "等待处理",
  running: "正在处理",
  waiting: "等待确认",
  completed: "已完成",
  failed: "执行失败",
  interrupted: "已停止",
};
</script>

<template>
  <button
    :id="`collaborator-entry-${progress.worker_session_id}${stage === 'finished' ? '-finished' : ''}`"
    type="button"
    class="collaborator-work-entry"
    :title="`查看${progress.display_name}的工作详情`"
    :aria-expanded="!!expanded"
    :aria-controls="`collaborator-window-${progress.worker_session_id}`"
    @click="$emit('open', progress.worker_session_id)"
  >
    <Bot :size="16" aria-hidden="true" />
    <span class="work-label" :class="{ 'running-shimmer': active }"
      >{{ progress.display_name
      }}{{ stage === "started" ? "开始工作" : labels[progress.status] }}</span
    >
    <LoaderCircle
      v-if="active"
      class="work-spinner"
      :size="12"
      aria-hidden="true"
    />
    <ChevronRight class="work-chevron" :size="13" aria-hidden="true" />
  </button>
</template>

<style scoped>
.collaborator-work-entry {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  max-width: 100%;
  padding: 7px 2px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  text-align: left;
  cursor: pointer;
}
.collaborator-work-entry:hover,
.collaborator-work-entry:focus-visible {
  color: var(--text);
}
.collaborator-work-entry > svg {
  flex: none;
}
.work-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.work-chevron {
  opacity: 0.5;
}
.work-spinner {
  animation: work-entry-spin 0.9s linear infinite;
}
@keyframes work-entry-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
