<script setup lang="ts">
import type { ScheduleRun } from "../../api/schedules";
import {
  dateTime,
  duration,
  runConversation,
  runLabel,
} from "../../domain/schedules";

defineProps<{
  runs: ScheduleRun[];
  now: number;
  pending: boolean;
  loading: boolean;
}>();
const emit = defineEmits<{
  archive: [run: ScheduleRun];
  remove: [run: ScheduleRun];
}>();
</script>

<template>
  <div class="schedule-table-wrap">
    <table class="schedule-table" aria-label="运行记录" :aria-busy="loading">
      <thead>
        <tr>
          <th scope="col">任务名称</th>
          <th scope="col">状态</th>
          <th scope="col">运行时间</th>
          <th scope="col">耗时</th>
          <th scope="col">执行环境</th>
          <th scope="col">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="!runs.length">
          <td colspan="6" class="schedule-table-empty">
            {{ loading ? "正在读取运行记录…" : "暂无符合条件的运行记录" }}
          </td>
        </tr>
        <template v-for="run in runs" :key="run.id">
          <tr>
            <td>
              <RouterLink
                v-if="run.session_id"
                class="schedule-link"
                :to="runConversation(run)"
                >{{ run.schedule_name }}</RouterLink
              >
              <span v-else>{{ run.schedule_name }}</span>
            </td>
            <td>
              <span class="schedule-run-status" :class="run.status">{{
                runLabel(run)
              }}</span>
            </td>
            <td>
              <time
                :datetime="
                  run.started_at || run.scheduled_for || run.created_at
                "
                >{{
                  dateTime(
                    run.started_at || run.scheduled_for || run.created_at,
                  )
                }}</time
              >
            </td>
            <td>{{ duration(run, now) }}</td>
            <td>企业沙箱</td>
            <td>
              <div class="schedule-table-actions">
                <button
                  type="button"
                  class="schedule-button quiet"
                  :disabled="pending"
                  @click="emit('archive', run)"
                >
                  {{ run.archived_at ? "取消归档" : "归档" }}
                </button>
                <button
                  type="button"
                  class="schedule-button quiet"
                  :disabled="pending"
                  @click="emit('remove', run)"
                >
                  删除
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="run.status === 'failed'" class="schedule-run-error-row">
            <td colspan="6">
              <details>
                <summary>查看失败原因</summary>
                <p>
                  {{ run.error_message || run.error_code || "任务执行失败。" }}
                </p>
              </details>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
