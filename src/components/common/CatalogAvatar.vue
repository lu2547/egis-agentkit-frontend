<script setup lang="ts">
import { computed } from 'vue';
import { catalogIconUrl } from '../../domain/catalogIcons';
const props = defineProps<{ avatar?: unknown; name?: string }>();
const url = computed(() => catalogIconUrl(props.avatar));
const builtInGlyphs: Record<string, string> = { spark: '✦', book: '▤', team: '◈', code: '⌘' };
</script>
<template><span class="catalog-avatar"><img v-if="url" :src="url" alt="" /><template v-else>{{ builtInGlyphs[String(avatar)] || name?.slice(0, 1) || '✦' }}</template></span></template>
<style scoped src="../../styles/components/catalog-avatar.css"></style>
