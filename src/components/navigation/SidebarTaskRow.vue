<script setup lang="ts">
import { LoaderCircle, Clock3 } from "lucide-vue-next";
import type { Task } from "../../types/api";
import AppIcon from "../common/AppIcon.vue";
defineProps<{
  task: Task;
  active: boolean;
  activity?: { running?: boolean; waiting?: boolean; unread?: boolean };
}>();
defineEmits<{ navigate: []; rename: [task: Task]; remove: [task: Task] }>();
function when(value: string) {
  const stamp = new Date(value).valueOf();
  if (!Number.isFinite(stamp)) return "";
  const days = Math.max(0, Math.floor((Date.now() - stamp) / 86400000));
  return days === 0
    ? "今天"
    : days === 1
      ? "昨天"
      : days < 7
        ? `${days}天前`
        : new Date(value).toLocaleDateString("zh-CN", {
            month: "short",
            day: "numeric",
          });
}
</script>
<template>
  <div class="conversation-row task-row" :class="{ active: active }">
    <RouterLink
      class="conversation-select"
      :to="`/tasks/${encodeURIComponent(task.session_id)}`"
      :title="task.name"
      @click="$emit('navigate')"
      ><span class="conversation-title">{{ task.name }}</span
      ><LoaderCircle
        v-if="activity?.running"
        class="task-running"
        :size="14"
        aria-label="正在运行"
      />
      <Clock3
        v-else-if="activity?.waiting"
        :size="14"
        aria-label="等待确认"
        class="task-waiting"
      />
      <span
        v-else-if="activity?.unread"
        class="task-unread"
        aria-label="已完成，待读"
      ></span>
      <time v-else>{{ when(task.updated_at) }}</time></RouterLink
    >
    <t-popup trigger="click" placement="bottom-right"
      ><button class="conversation-more" :aria-label="`${task.name}的更多操作`">
        <AppIcon name="more" :size="16" /></button
      ><template #content
        ><div class="conversation-actions">
          <button @click="$emit('rename', task)">
            <AppIcon name="edit" :size="15" />重命名</button
          ><button
            class="danger-text"
            :aria-label="`删除对话：${task.name}`"
            @click="$emit('remove', task)"
          >
            <AppIcon name="trash" :size="15" />删除对话
          </button>
        </div></template
      ></t-popup
    >
  </div>
</template>
<style scoped src="./SidebarTaskRow.css"></style>
