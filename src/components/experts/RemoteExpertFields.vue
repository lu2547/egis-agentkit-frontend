<script setup lang="ts">
import type { RemoteAgentConfig } from "../../types/api";

const config = defineModel<RemoteAgentConfig>({ required: true });
</script>

<template>
  <div v-field-label class="field">
    <label>通信方式</label>
    <t-select
      v-model="config.transport"
      :options="[
        { label: '同步 HTTP', value: 'http_sync' },
        { label: '异步 HTTP 回调', value: 'http_callback' },
        { label: 'WebSocket', value: 'websocket' },
      ]"
    />
  </div>
  <div v-field-label class="field">
    <label>远程端点</label>
    <t-input
      v-model="config.endpoint"
      :placeholder="config.transport === 'websocket' ? 'wss://expert.example/ws' : 'https://expert.example/v1/runs'"
    />
  </div>
  <div v-field-label class="field">
    <label>请求凭据引用</label>
    <t-input v-model="config.credential_ref" placeholder="EGIS_REMOTE_AGENT_FINANCE_TOKEN" />
    <small>填写服务端环境变量名。</small>
  </div>
  <div v-if="config.transport === 'http_callback'" v-field-label class="field">
    <label>回包签名密钥引用</label>
    <t-input v-model="config.callback_secret_ref" placeholder="EGIS_REMOTE_AGENT_FINANCE_CALLBACK_SECRET" />
  </div>
  <div v-if="config.transport !== 'websocket'" v-field-label class="field">
    <label>取消端点（可选）</label>
    <t-input v-model="config.cancel_endpoint" placeholder="https://expert.example/v1/cancel" />
  </div>
</template>
