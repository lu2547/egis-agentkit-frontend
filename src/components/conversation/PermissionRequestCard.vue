<script setup lang="ts">
import { ref } from "vue";
import type { ToolCallBlock } from "@agentscope-ai/agentscope/message";
const props = defineProps<{
  tool: ToolCallBlock;
  confirm: (tool: ToolCallBlock, allowed: boolean) => Promise<void>;
}>();
const pending = ref(false),
  error = ref(""),
  sent = ref(false);
async function answer(allowed: boolean) {
  pending.value = true;
  error.value = "";
  try {
    await props.confirm(props.tool, allowed);
    sent.value = true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    pending.value = false;
  }
}
</script>
<template>
  <div class="permission-card">
    <p>需要你的确认</p>
    <h4>{{ tool.name }}</h4>
    <pre>{{ tool.input }}</pre>
    <span v-if="sent" class="muted">已提交，等待恢复执行…</span>
    <div v-else class="actions">
      <t-button
        size="small"
        variant="outline"
        :disabled="pending"
        @click="answer(false)"
        >拒绝</t-button
      ><t-button
        size="small"
        theme="primary"
        :loading="pending"
        @click="answer(true)"
        >允许此次操作</t-button
      >
    </div>
    <div v-if="error" class="error">{{ error }}</div>
  </div>
</template>
<style scoped src="../../styles/components/PermissionRequestCard.css"></style>
