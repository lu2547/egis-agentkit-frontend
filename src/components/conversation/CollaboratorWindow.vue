<script setup lang="ts">
import { ChevronDown, ChevronUp, LoaderCircle } from "lucide-vue-next";
import { computed, ref, useId, watch } from "vue";
import { errorText } from "../../api/http";
import { runtime } from "../../api/runtime";
import { toolTitle } from "../../domain/turnPresentation";
import type { CollaboratorProgress } from "../../types/api";
import MarkdownContent from "./MarkdownContent.vue";

const props = defineProps<{ progress: CollaboratorProgress }>();
defineEmits<{ file: [path: string] }>();
const labels: Record<CollaboratorProgress["status"], string> = {
  queued: "已派单",
  running: "正在处理",
  waiting: "等待确认",
  completed: "已完成",
  failed: "执行失败",
  interrupted: "已停止",
};
const terminal = computed(() =>
  ["completed", "failed", "interrupted"].includes(props.progress.status),
);
const running = computed(() => props.progress.status === "running");
const hasRunningTool = computed(() =>
  props.progress.activities.some((activity) => activity.state === "running"),
);
const minimized = ref(terminal.value);
const answer = ref("");
const readError = ref("");
const id = useId();

watch(
  [() => props.progress.reply_id, terminal, minimized],
  async ([replyId, finished, collapsed], _, onCleanup) => {
    answer.value = "";
    readError.value = "";
    if (!replyId || !finished || collapsed) return;
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    try {
      const { worker_session_id: worker, worker_agent_id: agent } =
        props.progress;
      // The terminal SSE frame can arrive just before native message persistence.
      for (const delay of [0, 180, 400, 800, 1400]) {
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        controller.signal.throwIfAborted();
        const history = await runtime.history(worker, agent, controller.signal);
        const reply = history.messages.find(
          (message) => message.id === replyId,
        );
        if (reply?.finished_at && reply.role === "assistant") {
          answer.value = reply.content
            .flatMap((block) => (block.type === "text" ? [block.text] : []))
            .join("\n\n");
          return;
        }
      }
    } catch (cause) {
      if (!controller.signal.aborted) readError.value = errorText(cause);
    }
  },
  { immediate: true },
);
</script>

<template>
  <section class="collaborator-window" :aria-labelledby="`${id}-name`">
    <header>
      <strong :id="`${id}-name`" :title="progress.display_name">
        <span
          class="worker-name"
          :class="{
            'running-shimmer': running && (minimized || !hasRunningTool),
          }"
          >{{ progress.display_name }}</span
        >
      </strong>
      <span
        class="worker-status"
        :class="{ 'is-running': running }"
        role="status"
      >
        <LoaderCircle
          v-if="running"
          class="worker-spinner"
          :size="13"
          aria-hidden="true"
        />
        <span :class="{ 'status-text-hidden': running }">{{
          labels[progress.status]
        }}</span>
      </span>
      <button
        type="button"
        :aria-label="minimized ? '展开专家窗口' : '缩小专家窗口'"
        :title="minimized ? '展开专家窗口' : '缩小专家窗口'"
        :aria-expanded="!minimized"
        :aria-controls="`${id}-body`"
        @click="minimized = !minimized"
      >
        <ChevronDown v-if="minimized" :size="13" aria-hidden="true" />
        <ChevronUp v-else :size="13" aria-hidden="true" />
      </button>
    </header>
    <div v-show="!minimized" :id="`${id}-body`" class="worker-body">
      <ul v-if="progress.activities.length" class="activities">
        <li v-for="activity in progress.activities" :key="activity.id">
          <span
            :class="{
              'running-shimmer': running && activity.state === 'running',
            }"
            >{{ toolTitle(activity.name) }}</span
          >
          <span class="activity-status">{{
            activity.state === "running" && !terminal
              ? "处理中"
              : activity.state === "success"
                ? "完成"
                : activity.state === "error"
                  ? "失败"
                  : "已结束"
          }}</span>
        </li>
      </ul>
      <MarkdownContent
        v-if="answer"
        class="worker-answer"
        :text="answer"
        @file="$emit('file', $event)"
      />
      <p v-if="readError" role="alert">{{ readError }}</p>
    </div>
  </section>
</template>

<style scoped>
.collaborator-window {
  --motion-activity: 1.1s;
  flex: none;
  min-width: 0;
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 9px;
  color: var(--text);
}
header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 6px 5px 9px;
  font-size: 12px;
}
header strong {
  flex: 1;
  min-width: 0;
  font-weight: 600;
}
.worker-name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.worker-status,
.activity-status {
  flex: none;
  color: var(--muted);
  font-size: 11px;
}
.worker-status.is-running {
  order: -1;
  display: flex;
  align-items: center;
}
.status-text-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.worker-spinner {
  animation: collaborator-spin 0.9s linear infinite;
}
@keyframes collaborator-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .worker-spinner {
    animation: none;
  }
}
header button {
  display: grid;
  place-items: center;
  flex: none;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  color: var(--muted);
  background: transparent;
  cursor: pointer;
}
header button:hover {
  background: var(--hover);
  color: var(--text);
}
header button:focus-visible {
  outline-offset: 0;
}
.worker-body {
  max-height: min(25dvh, 156px);
  overflow: auto;
  overflow-wrap: anywhere;
  overscroll-behavior: contain;
  font-size: 12px;
}
.worker-body:not(:empty) {
  border-top: 1px solid var(--border);
}
.activities {
  display: grid;
  gap: 4px;
  padding: 6px 9px;
  margin: 0;
  list-style: none;
}
.activities li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.worker-answer,
.worker-body p {
  padding: 7px 9px;
  margin: 0;
}
.worker-answer.markdown {
  font-size: 11px;
  line-height: 1.55;
}
.worker-answer :deep(:is(h1, h2, h3, h4, h5, h6)) {
  font-size: inherit;
  font-weight: 600;
  margin: 8px 0 4px;
}
.worker-answer :deep(p) {
  margin-bottom: 6px;
}
.worker-answer :deep(:is(ul, ol)) {
  margin: 4px 0 6px;
  padding-inline-start: 15px;
}
.worker-answer :deep(li) {
  margin: 2px 0;
  padding-inline-start: 0;
}
.worker-answer :deep(table) {
  font-size: inherit;
  margin: 6px 0;
}
.worker-answer :deep(:is(th, td)) {
  padding: 3px 5px;
}
.worker-answer > :deep(:first-child) {
  margin-top: 0;
}
</style>
