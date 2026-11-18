<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { ConnectorAuthType, Resource } from "../../types/api";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";

const props = defineProps<{ visible: boolean; resource?: Resource | null }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const transport = "streamable_http";
const authOptions = [
  { label: "无认证", value: "none" },
  { label: "API Key", value: "api_key" },
  { label: "OAuth", value: "oauth" },
];
const title = computed(() => (props.resource ? "编辑连接器" : "添加连接器"));
const form = ref({
  display_name: "",
  description: "",
  url: "",
  auth_type: "oauth" as ConnectorAuthType,
  key_header: "Authorization",
  oauth_client_id: "",
  oauth_scope: "",
});
const error = ref("");
const urlError = ref("");
const pending = ref(false);

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    const resource = props.resource;
    const config = resource?.payload.config as
      | {
          url?: string;
          auth_type?: ConnectorAuthType;
          key_header?: string;
          oauth_client_id?: string;
          oauth_scope?: string;
        }
      | undefined;
    form.value = {
      display_name: resource?.display_name ?? "",
      description: resource?.description ?? "",
      url: config?.url ?? "",
      auth_type: config?.auth_type ?? resource?.auth_type ?? "oauth",
      key_header: config?.key_header ?? "Authorization",
      oauth_client_id: config?.oauth_client_id ?? "",
      oauth_scope: config?.oauth_scope ?? "",
    };
    error.value = "";
    urlError.value = "";
  },
);

function close() {
  if (!pending.value) emit("close");
}

async function save() {
  const { display_name, description, auth_type } = form.value;
  const url = form.value.url.trim();
  if (pending.value || !display_name.trim() || !url) return;

  const parsed = URL.canParse(url) ? new URL(url) : null;
  const scheme = auth_type === "none" ? "HTTP 或 HTTPS" : "HTTPS";
  const http = auth_type === "none" ? /^https?:\/\/[^/]/ : /^https:\/\/[^/]/;
  if (
    !parsed ||
    !http.test(url) ||
    /[\s`"<>\\]/.test(url) ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    parsed.port === "0"
  ) {
    urlError.value = `请输入服务商提供的 ${scheme} 地址，例如 https://mcp.example.com/mcp。`;
    return;
  }

  error.value = "";
  urlError.value = "";
  pending.value = true;
  const keyHeader = form.value.key_header.trim() || "Authorization";
  const clientId = form.value.oauth_client_id.trim();
  const scope = form.value.oauth_scope.trim();

  try {
    await manager.registerSystemResource("mcp", {
      ...(props.resource ? { resource_id: props.resource.resource_id } : {}),
      display_name: display_name.trim(),
      description: description.trim(),
      config: {
        transport,
        url,
        auth_type,
        ...(auth_type === "api_key" ? { key_header: keyHeader } : {}),
        ...(auth_type === "oauth" && clientId
          ? { oauth_client_id: clientId }
          : {}),
        ...(auth_type === "oauth" && scope ? { oauth_scope: scope } : {}),
      },
    });
    emit("saved");
    emit("close");
  } catch (err) {
    error.value = errorText(err);
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <t-dialog
    role="dialog"
    aria-modal="true"
    :aria-label="title"
    :visible="visible"
    :header="title"
    :footer="false"
    :close-on-overlay-click="false"
    placement="center"
    width="min(620px, calc(100vw - 32px))"
    dialog-class-name="connector-dialog"
    @close="close"
  >
    <form class="connector-form" @submit.prevent="save">
      <fieldset class="connector-fields" :disabled="pending">
        <legend>基础信息</legend>
        <div v-field-label class="field">
          <label>名称</label>
          <t-input
            v-model="form.display_name"
            placeholder="例如 报表系统"
            :maxlength="200"
          />
        </div>
        <div v-field-label class="field">
          <label>简介</label>
          <t-textarea
            v-model="form.description"
            :autosize="{ minRows: 2, maxRows: 3 }"
            :maxlength="2000"
            placeholder="这个连接器可以做什么"
          />
        </div>
      </fieldset>

      <fieldset class="connector-fields connection-fields" :disabled="pending">
        <legend>连接与认证</legend>
        <div v-field-label class="field">
          <label>连接方式</label>
          <t-input model-value="Streamable HTTP" readonly />
        </div>
        <div v-field-label class="field">
          <label>认证方式</label>
          <t-select
            v-model="form.auth_type"
            :options="authOptions"
            @change="urlError = ''"
          />
        </div>
        <div v-field-label class="field full-width">
          <label>服务地址</label>
          <t-input
            v-model="form.url"
            placeholder="https://mcp.example.com/mcp"
            :status="urlError ? 'error' : 'default'"
            @change="urlError = ''"
          />
          <small v-if="urlError" class="url-error" role="alert">{{
            urlError
          }}</small>
          <small v-else
            >填写 MCP Server 提供的地址。OAuth 和 API Key 使用 HTTPS。</small
          >
        </div>
        <div
          v-if="form.auth_type === 'api_key'"
          v-field-label
          class="field full-width"
        >
          <label>请求头</label>
          <t-input v-model="form.key_header" placeholder="Authorization" />
          <small
            >每个用户填写自己的密钥。Authorization 请求头会自动加上 Bearer
            前缀。</small
          >
        </div>
        <template v-if="form.auth_type === 'oauth'">
          <div v-field-label class="field">
            <label>OAuth 客户端 ID</label>
            <t-input
              v-model="form.oauth_client_id"
              placeholder="例如 agentkit-web"
              :maxlength="1024"
            />
            <small
              >填服务商分配的客户端
              ID。留空时，若服务商支持，系统会自动注册。授权服务地址会从 MCP
              服务自动发现。</small
            >
          </div>
          <div v-field-label class="field">
            <label>OAuth 权限范围</label>
            <t-input
              v-model="form.oauth_scope"
              placeholder="例如 mcp:tools"
              :maxlength="1024"
            />
            <small
              >按服务商要求填写，例如
              <code>mcp:tools</code
              >。多个权限用空格分隔，留空跟随服务端声明。</small
            >
          </div>
        </template>
      </fieldset>

      <p v-if="resource" class="connector-id">
        连接器 ID <code>{{ resource.resource_id }}</code>
      </p>
      <div v-if="error" class="error" role="alert">{{ error }}</div>
      <div class="connector-form-actions">
        <t-button variant="outline" :disabled="pending" @click="close"
          >取消</t-button
        >
        <t-button
          theme="primary"
          type="submit"
          :loading="pending"
          :disabled="!form.display_name.trim() || !form.url.trim()"
        >
          保存
        </t-button>
      </div>
    </form>
  </t-dialog>
</template>

<style scoped>
:global(.connector-dialog .t-dialog__header) {
  font-size: 20px;
  font-weight: 600;
}
:global(.connector-dialog .t-dialog__body) {
  max-height: calc(100dvh - 176px);
  padding-bottom: 0;
}

.connector-form {
  display: grid;
  gap: 18px;
}

.connector-fields {
  display: grid;
  gap: 14px;
  min-width: 0;
  margin: 0;
  padding: 12px 14px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
}

.connector-fields legend {
  padding: 0 6px;
  color: var(--text);
  font-size: 14px;
  font-weight: 600;
}

.connection-fields {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.full-width {
  grid-column: 1 / -1;
}

.connector-fields .field label {
  margin-bottom: 6px;
  color: var(--text);
}

.connector-fields .field small {
  margin-top: 5px;
}

.connector-fields .field .url-error {
  color: var(--danger);
}

.connector-id {
  color: var(--muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.connector-id code {
  margin-inline-start: 6px;
}

.connector-form-actions {
  position: sticky;
  bottom: 0;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 12px;
  padding-bottom: 2px;
  border-top: 1px solid var(--border);
  background: var(--bg);
}

@media (max-width: 540px) {
  .connection-fields {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
