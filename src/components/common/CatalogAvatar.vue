<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { manager } from "../../api/manager";
import { catalogIconUrl } from "../../domain/catalogIcons";
import type { Resource } from "../../types/api";

const props = defineProps<{
  avatar?: unknown;
  name?: string;
  skill?: Resource;
}>();
const generated = ref<string>();
const url = computed(() => generated.value || catalogIconUrl(props.avatar));
const builtInGlyphs: Record<string, string> = {
  spark: "✦",
  book: "▤",
  team: "◈",
  code: "⌘",
};
const glyph = computed(
  () =>
    builtInGlyphs[String(props.avatar)] ||
    Array.from(props.name?.trim() || "")[0] ||
    "✦",
);

watch(
  [
    () => props.skill?.resource_id,
    () => props.skill?.resource_version,
    () => props.skill?.payload.has_generated_avatar,
  ],
  async ([rid, version, hasAvatar], _, onCleanup) => {
    generated.value = undefined;
    if (!rid || !version || !hasAvatar) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    onCleanup(() => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    });
    try {
      const response = await manager.skillAvatar(rid, version, controller.signal);
      const image = await response.blob();
      if (controller.signal.aborted || image.type !== "image/svg+xml") return;
      objectUrl = URL.createObjectURL(image);
      generated.value = objectUrl;
    } catch {
      // Keep the skill's initial if the thumbnail cannot be loaded.
    }
  },
  { immediate: true },
);
</script>
<template>
  <span class="catalog-avatar">
    <img v-if="url" :src="url" alt="" @error="generated = undefined" />
    <template v-else>{{ glyph }}</template>
  </span>
</template>
<style scoped src="../../styles/components/catalog-avatar.css"></style>
