<script setup lang="ts">
import { computed, ref, watch, onUnmounted, useId } from "vue";
import type { Msg } from "@agentscope-ai/agentscope/message";
import type { ProcessEntry } from "../../domain/turnPresentation";
import MarkdownContent from "./MarkdownContent.vue";
import ProcessActivityGroup from "./ProcessActivityGroup.vue";
import MotionCollapse from "../common/MotionCollapse.vue";
import AppIcon from "../common/AppIcon.vue";
import { Terminal, Sparkles } from "lucide-vue-next";
const props = defineProps<{
  message: Msg;
  entries: ProcessEntry[];
  toolCount: number;
}>();
defineEmits<{ file: [path: string] }>();
const now = ref(Date.now()),
  opened = ref(false);
const bodyId = useId();
const latestActivity = computed(() =>
  props.entries
    .flatMap((entry) => (entry.type === "activities" ? entry.items : []))
    .at(-1),
);
const latestLabel = computed(() => {
  const activity = latestActivity.value;
  if (!activity || activity.kind === "thinking") return "正在思考";
  const title = ["pending", "running"].includes(activity.status)
    ? `正在${activity.title}`
    : `${activity.title} · ${activity.statusLabel}`;
  return `${title}${activity.summary ? ` · ${activity.summary}` : ""}`;
});
let timer: ReturnType<typeof setInterval> | undefined;
watch(
  () => props.message.finished_at,
  (finished) => {
    clearInterval(timer);
    if (!finished) {
      now.value = Date.now();
      timer = setInterval(() => {
        now.value = Date.now();
      }, 1000);
    }
  },
  { immediate: true },
);
onUnmounted(() => clearInterval(timer));
const elapsed = computed(() => {
  const start = Date.parse(props.message.created_at);
  const end = props.message.finished_at
    ? Date.parse(props.message.finished_at)
    : now.value;
  const seconds =
    Number.isFinite(start) && Number.isFinite(end)
      ? Math.max(0, Math.round((end - start) / 1000))
      : 0;
  return seconds >= 60
    ? `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
    : `${seconds} 秒`;
});
</script>
<template>
  <section class="turn-process">
    <button
      type="button"
      class="process-heading"
      :aria-expanded="opened"
      :aria-controls="bodyId"
      @click="opened = !opened"
    >
      <span
        v-if="!message.finished_at"
        class="running-dot"
        aria-hidden="true"
      ></span>
      <AppIcon v-else name="check" :size="13" />
      <span
        >{{ message.finished_at ? "处理时长" : "正在处理" }} {{ elapsed }}</span
      >
      <span v-if="toolCount" class="tool-count"
        >{{ toolCount }} 项工具活动</span
      >
      <AppIcon name="down" :size="12" :class="{ folded: !opened }" />
    </button>
    <div
      v-if="!message.finished_at && !opened"
      class="latest-activity"
      role="status"
    >
      <Terminal
        v-if="latestActivity?.kind === 'tool'"
        :size="15"
        aria-hidden="true"
      />
      <Sparkles v-else :size="15" aria-hidden="true" />
      <span class="running-shimmer" :title="latestLabel">{{
        latestLabel
      }}</span>
    </div>
    <MotionCollapse :id="bodyId" :open="opened">
      <div class="process-body">
        <template v-for="entry in entries" :key="entry.id">
          <ProcessActivityGroup
            v-if="entry.type === 'activities'"
            :group="entry"
            @file="$emit('file', $event)"
          />
          <div
            v-else
            class="process-commentary"
            :class="{ 'process-note': entry.type === 'hint' }"
          >
            <MarkdownContent :text="entry.text" @file="$emit('file', $event)" />
          </div>
        </template>
        <p v-if="!entries.length" class="process-empty">
          {{
            message.finished_at
              ? "本次回答没有额外执行过程。"
              : "正在整理你的问题…"
          }}
        </p>
      </div>
    </MotionCollapse>
  </section>
</template>
<style scoped src="../../styles/components/turn-process.css"></style>
