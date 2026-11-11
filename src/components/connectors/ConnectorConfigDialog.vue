<script setup lang="ts">
import { watch, ref, computed } from "vue";
import type { ConnectorAuthType, Resource } from "../../types/api";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";
const props = defineProps<{ visible: boolean; resource?: Resource | null; system?: boolean }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const configForm = ref({
    resource_id: "",

    display_name: "",
    description: "",
    transport: "streamable_http",
    url: "",
    auth_type: "none" as ConnectorAuthType,
    key_header: "Authorization",
    oauth_client_id: "",
    oauth_scope: "",
  }),
  error = ref(""),
  pending = ref(false);
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      const r = props.resource;
      const config = (r?.payload.config || r?.payload || {}) as Record<
        string,
        string
      >;
      Object.assign(configForm.value, {
        resource_id: r?.resource_id || "",

        display_name: r?.display_name || "",
        description: r?.description || "",
        transport: config.transport || "streamable_http",
        url: config.url || "",
        auth_type: config.auth_type || "none",
        key_header: config.key_header || "Authorization",
        oauth_client_id: config.oauth_client_id || "",
        oauth_scope: config.oauth_scope || "",
      });
      error.value = "";
    }
  },
);
const valid = computed(() =>
  Boolean(
    configForm.value.resource_id &&
    configForm.value.display_name &&
    /^https?:\/\//.test(configForm.value.url),
  ),
);
async function save() {
  pending.value = true;
  error.value = "";
  try {
    const { transport, url, auth_type, key_header, oauth_client_id, oauth_scope, ...meta } = configForm.value;
    const body = {
      ...meta,
      config: {
        transport, url, auth_type,
        ...(auth_type === "api_key" ? { key_header } : {}),
        ...(auth_type === "oauth" ? { oauth_client_id, oauth_scope } : {}),
      },
    };
    if (props.system) await manager.registerSystemResource("mcp", body);
    else await manager.saveResource("connectors", body);
    emit("saved");
    emit("close");
  } catch (e) {
    error.value = errorText(e);
  } finally {
    pending.value = false;
  }
}
</script>
<template>
  <t-dialog
    role="dialog"
    aria-modal="true"
    :aria-label="resource ? '发布连接器新版本' : '添加连接器'"
    :visible="visible"
    :header="resource ? '发布连接器新版本' : '添加连接器'"
    :footer="false"
    width="610px"
    @close="$emit('close')"
    ><form class="form-stack" @submit.prevent="save">
      <div class="form-row">
        <div v-field-label class="field">
          <label>连接器 ID</label
          ><t-input v-model="configForm.resource_id" :disabled="!!resource" />
        </div>
      </div>
      <div v-field-label class="field">
        <label>名称</label><t-input v-model="configForm.display_name" />
      </div>
      <div v-field-label class="field">
        <label>简介</label
        ><t-textarea
          v-model="configForm.description"
          :autosize="{ minRows: 2, maxRows: 3 }"
        />
      </div>
      <div v-field-label class="field">
        <label>服务地址</label
        ><t-input
          v-model="configForm.url"
          placeholder="https://mcp.example.com/mcp"
        />
      </div>
      <div v-field-label class="field">
        <label>认证方式</label>
        <t-select v-model="configForm.auth_type" :options="[
          { label: '无认证', value: 'none' },
          { label: 'API Key', value: 'api_key' },
          { label: 'OAuth', value: 'oauth' },
        ]" />
      </div>
      <div v-if="configForm.auth_type === 'api_key'" v-field-label class="field">
        <label>请求头</label>
        <t-input v-model="configForm.key_header" />
        <small>用户使用自己的密钥。Authorization 请求头会自动添加 Bearer 前缀。</small>
      </div>
      <template v-if="configForm.auth_type === 'oauth'">
        <div v-field-label class="field">
          <label>OAuth 客户端 ID（可选）</label>
          <t-input v-model="configForm.oauth_client_id" />
        </div>
        <div v-field-label class="field">
          <label>OAuth 权限范围（可选）</label>
          <t-input v-model="configForm.oauth_scope" />
        </div>
      </template>
      <div v-if="error" class="error">{{ error }}</div>
      <div class="form-actions">
        <t-button variant="outline" @click="$emit('close')">取消</t-button
        ><t-button
          type="submit"
          theme="primary"
          :loading="pending"
          :disabled="!valid"
          >保存版本</t-button
        >
      </div>
    </form></t-dialog
  >
</template>
