<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Plug, Plus } from "lucide-vue-next";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";
import { useAdminPage } from "../../composables/useAdminPage";
import AdminPagination from "./AdminPagination.vue";
import type { AdminResource, ConnectorAuthType } from "../../types/api";
import AsyncState from "../common/AsyncState.vue";
import ConnectorConfigDialog from "../connectors/ConnectorConfigDialog.vue";
import ConnectorConnectionTest from "../connectors/ConnectorConnectionTest.vue";
import AdminSectionHeader from "./AdminSectionHeader.vue";
import AdminStatusBadge from "./AdminStatusBadge.vue";

const { data, loading, error, load, changePage } = useAdminPage((page) =>
  manager.adminPage<AdminResource>("resources/mcp", page),
);
const notice = ref("");
const pending = ref(false);
const editing = ref<AdminResource | null>(null);
const testing = ref<AdminResource | null>(null);
const editorOpen = ref(false);
const authLabels: Record<ConnectorAuthType, string> = {
  none: "无认证",
  api_key: "API Key",
  oauth: "OAuth",
};
onMounted(load);

function edit(resource: AdminResource | null) {
  editing.value = resource;
  editorOpen.value = true;
}

async function toggle(resource: AdminResource) {
  pending.value = true;
  notice.value = "";
  try {
    await manager.setResourceAvailability(
      "mcp",
      resource.resource_id,
      undefined,
      !resource.is_available,
    );
    await load();
  } catch (err) {
    notice.value = errorText(err);
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <div>
    <AdminSectionHeader title="MCP">
      <t-button theme="primary" @click="edit(null)">
        <template #icon><Plus :size="16" /></template>
        新增连接器
      </t-button>
    </AdminSectionHeader>
    <div v-if="notice" class="error" role="alert">{{ notice }}</div>
    <AsyncState
      :loading="loading"
      :error="error"
      :empty="!data?.items.length"
      empty-title="暂无连接器"
      empty-text="添加 MCP 服务供公司组成员使用。"
      @retry="load"
    >
      <div class="mcp-list">
        <article
          v-for="resource in data?.items"
          :key="resource.resource_id"
          :aria-label="resource.display_name"
          class="mcp-server"
        >
          <div class="server-header">
            <span class="server-icon" aria-hidden="true"
              ><Plug :size="20"
            /></span>
            <div class="server-identity">
              <h3>{{ resource.display_name }}</h3>
              <p class="service-url">
                {{
                  (resource.payload.config as { url?: string } | undefined)?.url
                }}
              </p>
            </div>
            <AdminStatusBadge
              :tone="resource.is_available ? 'success' : 'neutral'"
            >
              {{ resource.is_available ? "已启用" : "已停用" }}
            </AdminStatusBadge>
          </div>
          <p v-if="resource.description" class="server-description">
            {{ resource.description }}
          </p>
          <div class="server-footer">
            <div class="server-configuration">
              <span>Streamable HTTP</span>
              <span>{{ authLabels[resource.auth_type || "none"] }}</span>
            </div>
            <div class="admin-actions">
              <t-button
                size="small"
                variant="outline"
                theme="default"
                @click="edit(resource)"
                >编辑</t-button
              >
              <t-button
                size="small"
                variant="outline"
                theme="default"
                :disabled="!resource.is_available"
                @click="testing = resource"
              >
                测试连接
              </t-button>
              <t-button
                size="small"
                variant="outline"
                theme="default"
                :disabled="pending"
                @click="toggle(resource)"
              >
                {{ resource.is_available ? "停用" : "启用" }}
              </t-button>
            </div>
          </div>
        </article>
      </div>
    </AsyncState>
    <AdminPagination
      v-if="data?.items.length"
      label="MCP"
      :page="data.page"
      :has-next="data.has_next"
      :disabled="loading || pending"
      @change="changePage"
    />
    <ConnectorConfigDialog
      :visible="editorOpen"
      :resource="editing"
      @close="editorOpen = false"
      @saved="load"
    />
    <t-dialog
      :visible="!!testing"
      :header="testing?.display_name"
      :footer="false"
      @close="testing = null"
    >
      <ConnectorConnectionTest
        v-if="testing"
        :key="testing.resource_id"
        :resource-id="testing.resource_id"
      />
    </t-dialog>
  </div>
</template>

<style scoped>
.mcp-list {
  display: grid;
  gap: 14px;
}
.mcp-server {
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
}
.server-header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: 12px;
}
.server-icon {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border-radius: 9px;
  background: var(--surface);
  color: var(--muted);
}
.server-identity h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.service-url {
  margin-top: 4px;
  color: var(--muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.server-description {
  margin-top: 12px;
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.server-footer,
.server-configuration {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.server-footer {
  justify-content: space-between;
  gap: 10px;
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}
.server-configuration span {
  padding: 2px 7px;
  border-radius: 5px;
  background: var(--surface);
  color: var(--muted);
  font-size: 12px;
}
</style>
