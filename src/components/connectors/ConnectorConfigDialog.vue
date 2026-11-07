<script setup lang="ts">
import { watch, ref, reactive, computed } from "vue";
import type { Resource } from "../../types/api";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";
const props = defineProps<{ visible: boolean; resource?: Resource | null }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const configForm = ref({
    resource_id: "",
    resource_version: "1.0.0",
    display_name: "",
    description: "",
    transport: "streamable_http",
    url: "",
    credential_ref: "",
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
        resource_version: r ? "" : "1.0.0",
        display_name: r?.display_name || "",
        description: r?.description || "",
        transport: config.transport || "streamable_http",
        url: config.url || "",
        credential_ref: config.credential_ref || "",
      });
      error.value = "";
    }
  },
);
const valid = computed(() =>
  Boolean(
    configForm.value.resource_id &&
    configForm.value.resource_version &&
    configForm.value.display_name &&
    /^https?:\/\//.test(configForm.value.url),
  ),
);
async function save() {
  pending.value = true;
  error.value = "";
  try {
    const { transport, url, credential_ref, ...meta } = configForm.value;
    await manager.saveResource("connectors", {
      ...meta,
      config: { transport, url, ...(credential_ref ? { credential_ref } : {}) },
    });
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
        <div v-field-label class="field">
          <label>版本</label
          ><t-input
            v-model="configForm.resource_version"
            placeholder="例如 1.0.0"
          />
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
        <label>传输方式</label
        ><t-select
          v-model="configForm.transport"
          :options="[
            { label: 'Streamable HTTP', value: 'streamable_http' },
            { label: 'SSE', value: 'sse' },
          ]"
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
        <label>凭据引用（可选）</label
        ><t-input
          v-model="configForm.credential_ref"
          placeholder="选择服务端已配置的凭据标识"
        /><small>凭据由服务端管理，前端不会读取或返回原始密钥。</small>
      </div>
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
