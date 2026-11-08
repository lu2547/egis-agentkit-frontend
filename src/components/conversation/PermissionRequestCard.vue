<script setup lang="ts">
import { computed, ref } from "vue";
import type { ToolCallBlock } from "@agentscope-ai/agentscope/message";
import { sessionApprovalRules } from "../../domain/permissionApproval";
const props = defineProps<{
  tool: ToolCallBlock;
  confirm: (
    tool: ToolCallBlock,
    allowed: boolean,
    rememberForSession?: boolean,
  ) => Promise<void>;
}>();
const pending = ref(false),
  error = ref(""),
  sent = ref(false);
const remember = ref(false);
const rules = computed(() => sessionApprovalRules(props.tool));
const willRemember = computed(() => remember.value && rules.value.length > 0);
async function answer(allowed: boolean) {
  pending.value = true;
  error.value = "";
  try {
    await props.confirm(props.tool, allowed, allowed && willRemember.value);
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
    <template v-else>
      <div class="actions">
        <t-button
          size="small"
          variant="outline"
          :disabled="pending"
          @click="answer(false)"
          >拒绝</t-button
        >
        <t-checkbox v-if="rules.length" v-model="remember" :disabled="pending">
          本会话记住此授权
        </t-checkbox>
        <t-button
          size="small"
          theme="primary"
          :loading="pending"
          @click="answer(true)"
          >{{ willRemember ? "允许并记住" : "允许此次操作" }}</t-button
        >
      </div>
      <div v-if="willRemember" class="rule-scope">
        <span>匹配范围</span>
        <ul>
          <li v-for="(rule, index) in rules" :key="index">
            <code v-if="rule.rule_content !== null">{{ rule.rule_content }}</code>
            <span v-else>此工具的所有调用</span>
          </li>
        </ul>
      </div>
    </template>
    <div v-if="error" class="error">{{ error }}</div>
  </div>
</template>
<style scoped src="../../styles/components/PermissionRequestCard.css"></style>
