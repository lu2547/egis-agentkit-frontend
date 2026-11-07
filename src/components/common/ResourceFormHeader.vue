<script setup lang="ts">
import { ArrowLeft } from "lucide-vue-next";

withDefaults(
  defineProps<{
    title: string;
    description: string;
    returnLabel: string;
    level?: "h1" | "h2";
  }>(),
  { level: "h2" },
);
defineEmits<{ back: [] }>();
</script>

<template>
  <header class="resource-form-header">
    <button type="button" class="form-return" @click="$emit('back')">
      <ArrowLeft :size="16" aria-hidden="true" />{{ returnLabel }}
    </button>
    <div>
      <component :is="level">{{ title }}</component>
      <p>{{ description }}</p>
    </div>
  </header>
</template>

<style scoped src="../../styles/components/resource-form-header.css"></style>
