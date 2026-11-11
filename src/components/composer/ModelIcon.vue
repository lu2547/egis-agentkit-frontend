<script setup lang="ts">
import { computed } from "vue";
import { BrainCircuit } from "lucide-vue-next";
import type { ModelOption } from "../../types/api";

const props = defineProps<{ model?: ModelOption }>();
const brands = ["deepseek", "qwen", "glm"] as const;
const brand = computed(() =>
  brands.find(
    (name) =>
      props.model?.key.toLowerCase().startsWith(name) ||
      props.model?.display_name.toLowerCase().startsWith(name),
  ),
);
</script>

<template>
  <span v-if="brand === 'glm'" class="model-icon glm-mark" aria-hidden="true" />
  <img
    v-else-if="brand"
    class="model-icon"
    :src="`/model-icons/${brand}.svg`"
    alt=""
    width="16"
    height="16"
  />
  <BrainCircuit v-else class="model-icon" :size="16" :stroke-width="1.6" aria-hidden="true" />
</template>

<style scoped>
.model-icon {
  display: block;
  flex: 0 0 16px;
  width: 16px;
  height: 16px;
}

.glm-mark {
  background: currentColor;
  mask: url("/model-icons/glm.svg") center / contain no-repeat;
}
</style>
