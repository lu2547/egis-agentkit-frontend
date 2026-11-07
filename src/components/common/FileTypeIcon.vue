<script setup lang="ts">
import { computed } from "vue";
import { fileIconType, fileIconUrl } from "../../domain/fileIcons";
const props = withDefaults(defineProps<{ name: string; size?: number }>(), {
  size: 24,
});
const type = computed(() => fileIconType(props.name));
</script>
<template>
  <img
    class="file-type-icon"
    :src="fileIconUrl(name)"
    :data-file-type="type"
    :width="size"
    :height="size"
    alt=""
    aria-hidden="true"
  />
</template>
<style scoped src="../../styles/components/file-type-icon.css"></style>
