<script setup lang="ts">
import { useTheme } from "../../composables/useTheme";
withDefaults(defineProps<{ compact?: boolean; welcome?: boolean }>(), {
  compact: false,
  welcome: false,
});
const { theme } = useTheme();
</script>
<template>
  <span
    class="brand-identity"
    :class="{ 'is-compact': compact, 'is-welcome': welcome }"
  >
    <img
      :src="`/brand/${welcome ? 'welcome' : 'wordmark'}-v2-${theme}.png`"
      :alt="welcome ? '养老险GPT，今天，想一起完成什么？' : '养老险GPT'"
      :width="welcome ? 1624 : 2172"
      :height="welcome ? 969 : 724"
      draggable="false"
    />
  </span>
</template>
<style scoped src="../../styles/components/brand-identity.css"></style>
