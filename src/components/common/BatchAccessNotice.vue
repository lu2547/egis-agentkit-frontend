<script setup lang="ts">
import { computed } from "vue";
import type { BatchAccessResult } from "../../types/api";

const props = defineProps<{
  results: BatchAccessResult[];
  labels: Record<string, string>;
}>();
const failures = computed(() => props.results.filter((item) => !item.success));
</script>

<template>
  <div role="status">
    <p>
      成功 {{ results.length - failures.length }} 项，失败
      {{ failures.length }} 项。
    </p>
    <ul v-if="failures.length" class="error">
      <li v-for="item in failures" :key="item.id">
        {{ labels[item.id] || item.id }} · {{ item.detail }}
      </li>
    </ul>
  </div>
</template>
