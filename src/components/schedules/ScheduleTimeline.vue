<script setup lang="ts">
import { computed } from "vue";
import type { Schedule, ScheduleRun } from "../../api/schedules";
import {
  dateTime,
  duration,
  nextRunLabel,
  runConversation,
  runLabel,
} from "../../domain/schedules";

const props = defineProps<{
  task: Schedule;
  runs: ScheduleRun[];
  now: number;
  loading: boolean;
}>();
const history = computed(() =>
  [...props.runs].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
  ),
);

function runText(run: ScheduleRun) {
  if (run.status === "failed")
    return run.error_message || run.error_code || "任务执行失败。";
  if (run.status === "queued") return "正在等待执行。";
  if (run.status === "running") return "任务正在执行。";
  return run.summary || "运行完成。";
}

function hasMore(text: string) {
  return text.length > 110 || text.split("\n").length > 2;
}
</script>

<template>
  <div
    class="schedule-timeline"
    aria-label="任务运行时间线"
    :aria-busy="loading"
  >
    <article v-if="!history.length" class="schedule-timeline-item">
      <div class="schedule-timeline-entry schedule-help">
        {{ loading ? "正在读取运行记录…" : "还没有运行记录" }}
      </div>
    </article>
    <article
      v-for="run in history"
      :key="run.id"
      class="schedule-timeline-item"
    >
      <time :datetime="run.started_at || run.scheduled_for || run.created_at">{{
        dateTime(run.started_at || run.scheduled_for || run.created_at)
      }}</time>
      <div class="schedule-timeline-entry">
        <div class="schedule-entry-meta">
          <span class="schedule-run-status" :class="run.status">{{
            runLabel(run)
          }}</span>
          <span v-if="run.started_at" class="schedule-help">{{
            duration(run, now)
          }}</span>
        </div>
        <details v-if="hasMore(runText(run))" class="schedule-entry-summary">
          <summary>
            <span class="schedule-entry-excerpt">{{ runText(run) }}</span
            ><span class="schedule-entry-expand">查看摘要</span
            ><span class="schedule-entry-collapse">收起摘要</span>
          </summary>
          <p>{{ runText(run) }}</p>
        </details>
        <p v-else class="schedule-entry-text">{{ runText(run) }}</p>
        <RouterLink
          v-if="run.session_id"
          class="schedule-link"
          :to="runConversation(run)"
          >查看会话</RouterLink
        >
      </div>
    </article>
    <div class="schedule-timeline-item schedule-timeline-next">
      {{ nextRunLabel(task) }}
    </div>
  </div>
</template>
