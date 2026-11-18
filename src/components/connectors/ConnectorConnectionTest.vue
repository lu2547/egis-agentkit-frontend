<script setup lang="ts">
import { ref } from "vue";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";
const props = defineProps<{ resourceId: string }>();
const pending = ref(false),
  error = ref(""),
  tools = ref<{ name: string; description?: string }[] | null>(null);
async function test() {
  pending.value = true;
  error.value = "";
  tools.value = null;
  try {
    const result = await manager.connectorTest(props.resourceId);
    if (result.is_connected === false)
      throw new Error(result.error || "连接失败");
    tools.value = result.tools || [];
  } catch (e) {
    error.value = errorText(e);
  } finally {
    pending.value = false;
  }
}
</script>
<template>
  <div>
    <t-button variant="outline" :loading="pending" @click="test"
      >测试连接并获取工具</t-button
    >
    <div v-if="error" class="error test-result">{{ error }}</div>
    <div v-if="tools" class="test-result">
      <p class="connected">连接成功 · {{ tools.length }} 个工具</p>
      <div v-for="tool in tools" :key="tool.name" class="tool-item">
        <strong>{{ tool.name }}</strong>
        <p>{{ tool.description }}</p>
      </div>
    </div>
  </div>
</template>
<style scoped src="../../styles/components/ConnectorConnectionTest.css"></style>
