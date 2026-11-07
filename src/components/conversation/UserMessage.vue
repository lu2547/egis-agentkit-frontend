<script setup lang="ts">
import type { Msg } from "@agentscope-ai/agentscope/message";
defineProps<{ message: Msg }>();
</script>
<template>
  <article class="user-message">
    <div>
      <template v-for="block in message.content" :key="block.id"
        ><p v-if="block.type === 'text'">{{ block.text }}</p>
        <span v-else-if="block.type === 'data'" class="badge">{{
          block.name || "附件"
        }}</span></template
      >
    </div>
  </article>
</template>
<style scoped src="../../styles/components/user-message.css"></style>
