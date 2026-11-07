<script setup lang="ts">
defineProps<{ prompts: string[] }>();
defineEmits<{ select: [text: string] }>();
</script>
<template>
  <div class="prompts">
    <button
      v-for="prompt in prompts"
      :key="prompt"
      @click="$emit('select', prompt)"
    >
      <span>↳</span>{{ prompt }}
    </button>
  </div>
</template>
<style scoped src="../../styles/components/PromptStarterList.css"></style>
