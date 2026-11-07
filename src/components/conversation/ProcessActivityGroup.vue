<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { ChevronDown } from "lucide-vue-next";
import type { ActivityGroup } from "../../domain/turnPresentation";
import MotionCollapse from "../common/MotionCollapse.vue";
import ProcessActivityRow from "./ProcessActivityRow.vue";
const props = defineProps<{ group: ActivityGroup }>();
defineEmits<{ file: [path: string] }>();
const opened = ref(false);
const id = useId();
const title = computed(() =>
  props.group.toolCount
    ? `执行工具 ${props.group.toolCount} 次`
    : props.group.items.some((item) => item.status === "running")
      ? "正在思考"
      : "已思考",
);
</script>
<template>
  <section class="activity-group" :data-group-id="group.id">
    <button
      type="button"
      class="activity-group-heading"
      :aria-expanded="opened"
      :aria-controls="id"
      @click="opened = !opened"
    >
      <span class="activity-expander"
        ><ChevronDown
          :size="13"
          :class="{ folded: !opened }"
          aria-hidden="true"
      /></span>
      <span>{{ title }}</span>
    </button>
    <MotionCollapse :id="id" :open="opened">
      <ol class="activity-list" aria-label="工具与思考活动">
        <li v-for="item in group.items" :key="item.id">
          <ProcessActivityRow :activity="item" @file="$emit('file', $event)" />
        </li>
      </ol>
    </MotionCollapse>
  </section>
</template>
<style scoped src="../../styles/components/process-activity-group.css"></style>
