<script setup lang="ts">
import { computed } from "vue";
import {
  CheckCircle2,
  Circle,
  CircleX,
  Clock3,
  ChevronRight,
  LoaderCircle,
  ShieldAlert,
  CircleStop,
  CircleHelp,
} from "lucide-vue-next";
import type { ProcessActivity } from "../../domain/turnPresentation";
import MarkdownContent from "./MarkdownContent.vue";
const props = defineProps<{ activity: ProcessActivity }>();
defineEmits<{ file: [path: string] }>();
const statusIcon = computed(
  () =>
    ({
      success: CheckCircle2,
      error: CircleX,
      denied: ShieldAlert,
      interrupted: CircleStop,
      waiting: Clock3,
      running: LoaderCircle,
      pending: Circle,
      incomplete: CircleHelp,
    })[props.activity.status],
);
</script>
<template>
  <details
    class="activity-row"
    :data-status="activity.status"
    :data-activity-id="activity.id"
  >
    <summary
      :aria-label="`${activity.title}，${activity.statusLabel}${activity.summary ? `，${activity.summary}` : ''}`"
    >
      <component
        :is="statusIcon"
        :size="14"
        class="activity-icon"
        :class="{ spinning: activity.status === 'running' }"
        :aria-label="activity.statusLabel"
      />
      <span class="activity-title">{{ activity.title }}</span>
      <span
        v-if="activity.summary"
        class="activity-summary"
        :title="activity.summary"
        >· {{ activity.summary }}</span
      >
      <span
        v-if="activity.status !== 'success' && activity.kind === 'tool'"
        class="activity-state"
        >{{ activity.statusLabel }}</span
      >
      <ChevronRight :size="12" class="activity-chevron" aria-hidden="true" />
    </summary>
    <div class="activity-detail">
      <p class="activity-meta">
        {{ activity.kind === "tool" ? `${activity.rawName} · ` : ""
        }}{{ activity.statusLabel }}
      </p>
      <template v-if="activity.kind === 'tool'">
        <h5>输入参数</h5>
        <pre>{{ activity.input || "无参数" }}</pre>
        <template v-if="activity.output"
          ><h5>执行结果</h5>
          <pre>{{ activity.output }}</pre>
        </template>
        <p v-else class="activity-empty">
          {{
            activity.status === "success"
              ? "工具执行成功，无文本结果。"
              : activity.statusLabel
          }}
        </p>
      </template>
      <MarkdownContent
        v-else-if="activity.output"
        :text="activity.output"
        @file="$emit('file', $event)"
      />
      <p v-else class="activity-empty">{{ activity.statusLabel }}</p>
    </div>
  </details>
</template>
<style scoped src="../../styles/components/process-activity-row.css"></style>
