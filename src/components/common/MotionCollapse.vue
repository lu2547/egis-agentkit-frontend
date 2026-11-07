<script setup lang="ts">
import { ref, watch } from "vue";
const props = defineProps<{ open: boolean }>();
const rendered = ref(props.open);
watch(
  () => props.open,
  (value) => {
    if (value) rendered.value = true;
  },
);
</script>
<template>
  <div
    class="motion-collapse"
    :class="{ 'is-open': open }"
    :inert="!open"
    :aria-hidden="!open || undefined"
  >
    <div class="motion-collapse-clip"><slot v-if="rendered" /></div>
  </div>
</template>
