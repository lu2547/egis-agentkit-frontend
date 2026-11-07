<script setup lang="ts">
import { onMounted } from "vue";
import { manager } from "../api/manager";
import { useAsyncData } from "../composables/useAsyncData";
import AsyncState from "../components/common/AsyncState.vue";
import AssistantPreferencesPanel from "../components/preferences/AssistantPreferencesPanel.vue";
defineProps<{ embedded?: boolean }>();
const { data, loading, error, load } = useAsyncData(() =>
  manager.preferences(),
);
onMounted(load);
</script>
<template>
  <section class="preferences-page" :class="{ page: !embedded }">
    <AsyncState :loading="loading" :error="error" @retry="load"
      ><AssistantPreferencesPanel v-if="data" :documents="data"
    /></AsyncState>
  </section>
</template>
<style scoped src="../styles/components/PreferencesView.css"></style>
