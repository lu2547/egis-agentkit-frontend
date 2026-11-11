<script setup lang="ts">
import { onMounted, ref } from "vue";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";
import type { ConnectorAuthType } from "../../types/api";

const props = defineProps<{
  resourceId: string;
  version: string;
  method: ConnectorAuthType;
}>();
const authorized = ref(false);
const pending = ref(false);
const key = ref("");
const error = ref("");
async function run(action: () => Promise<void>) {
  pending.value = true;
  error.value = "";
  try {
    await action();
  } catch (err) {
    error.value = errorText(err);
  } finally {
    pending.value = false;
  }
}
onMounted(() =>
  run(async () => {
    authorized.value = (
      await manager.connectorAuthorization(props.resourceId, props.version)
    ).authorized;
  }),
);
function authorize() {
  return run(async () => {
    if (props.method === "api_key") {
      authorized.value = (
        await manager.saveConnectorKey(
          props.resourceId,
          props.version,
          key.value,
        )
      ).authorized;
      key.value = "";
      return;
    }
    const { authorization_url, state } = await manager.startConnectorOAuth(
      props.resourceId,
      props.version,
    );
    sessionStorage.setItem(
      `egis-mcp-oauth:${state}`,
      JSON.stringify({
        resourceId: props.resourceId,
        version: props.version,
      }),
    );
    window.location.assign(authorization_url);
  });
}
function revoke() {
  return run(async () => {
    authorized.value = (
      await manager.revokeConnectorAuthorization(
        props.resourceId,
        props.version,
      )
    ).authorized;
  });
}
</script>
<template>
  <section class="form-stack" aria-label="连接授权">
    <div>
      <strong>连接授权</strong>
      <p>{{ authorized ? "已授权" : "未授权" }}</p>
    </div>
    <form class="form-stack" @submit.prevent="authorize">
      <div v-if="method === 'api_key'" v-field-label class="field">
        <label>个人 API Key</label>
        <t-input v-model="key" type="password" autocomplete="off" />
      </div>
      <div class="detail-actions">
        <t-button
          type="submit"
          :loading="pending"
          :disabled="method === 'api_key' && !key"
        >
          {{
            method === "oauth"
              ? authorized
                ? "重新授权"
                : "OAuth 授权"
              : "保存密钥"
          }}
        </t-button>
        <t-button
          v-if="authorized"
          variant="outline"
          :disabled="pending"
          @click="revoke"
          >撤销授权</t-button
        >
      </div>
    </form>
    <div v-if="error" class="error" role="alert">{{ error }}</div>
  </section>
</template>
