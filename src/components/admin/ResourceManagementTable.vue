<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";
import { useAsyncData } from "../../composables/useAsyncData";
import { principalName } from "../../types/api";
import type { AdminResource, CatalogKind, Resource } from "../../types/api";
import AsyncState from "../common/AsyncState.vue";
import ConnectorConfigDialog from "../connectors/ConnectorConfigDialog.vue";

const props = defineProps<{ kind: CatalogKind }>();
const { data, loading, error, load } = useAsyncData(() =>
  manager.adminResources(props.kind),
);
const notice = ref("");
const pending = ref("");
const connectorOpen = ref(false);
const connector = ref<Resource | null>(null);
const title = computed(
  () => ({ skill: "技能", mcp: "连接器" })[props.kind],
);
watch(() => props.kind, load, { immediate: true });

async function toggle(resource: AdminResource) {
  pending.value = `${resource.resource_id}@${resource.resource_version}`;
  notice.value = "";
  try {
    await manager.setResourceAvailability(
      props.kind,
      resource.resource_id,
      resource.resource_version,
      !resource.is_available,
    );
    await load();
  } catch (err) {
    notice.value = errorText(err);
  } finally {
    pending.value = "";
  }
}
async function editConnector(resource: AdminResource) {
  notice.value = "";
  try {
    connector.value = await manager.resource(
      "connectors",
      resource.resource_id,
      resource.resource_version,
    );
    connectorOpen.value = true;
  } catch (err) {
    notice.value = errorText(err);
  }
}
</script>
<template>
  <div class="management-resources">
    <div class="management-heading">
      <h2>{{ title }}</h2>
      <RouterLink v-if="kind === 'skill'" to="/skills/new?system=1"
        >创建系统技能</RouterLink
      >
      <t-button
        v-if="kind === 'mcp'"
        @click="
          connector = null;
          connectorOpen = true;
        "
        >登记系统连接器</t-button
      >
    </div>
    <div v-if="notice" class="error" role="alert">{{ notice }}</div>
    <AsyncState
      :loading="loading"
      :error="error"
      :empty="!data?.items.length"
      :empty-title="`暂无${title}`"
      @retry="load"
    >
      <div v-if="data?.items.length" class="management-table-wrap">
        <table class="management-table">
          <thead>
            <tr>
              <th>资源与版本</th>
              <th>状态</th>
              <th>绑定专家</th>
              <th>授权来源</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="resource in data.items"
              :key="`${resource.resource_id}@${resource.resource_version}`"
            >
              <td>
                <strong>{{ resource.display_name }}</strong>
                <small
                  >{{ resource.resource_id }} ·
                  {{ resource.resource_version }}</small
                >
                <small>{{ resource.owner_type === "system" ? "系统资源" : resource.owner_id }}</small>
                <small v-if="kind === 'mcp'">{{
                  resource.auth_type || "none"
                }}</small>
              </td>
              <td>{{ resource.is_available ? "已启用" : "已停用" }}</td>
              <td>
                <span
                  v-for="agent in resource.bound_agents"
                  :key="agent.id"
                  class="management-entry"
                  >{{ agent.name }}</span
                ><span v-if="!resource.bound_agents.length">—</span>
              </td>
              <td>
                <span
                  v-for="grant in resource.grant_sources"
                  :key="grant.id"
                  class="management-entry"
                >
                  {{ grant.grant_source_type }} ·
                  {{ principalName(grant.principal_type, grant.principal_id) }}
                </span>
                <span v-if="!resource.grant_sources.length">—</span>
              </td>
              <td>
                <t-button
                  size="small"
                  variant="outline"
                  :disabled="!!pending"
                  @click="toggle(resource)"
                >
                  {{ resource.is_available ? "停用" : "启用" }}
                </t-button>
                <RouterLink
                  v-if="kind === 'skill' && resource.owner_type === 'system'"
                  :to="`/skills/${encodeURIComponent(resource.resource_id)}/edit?system=1&version=${encodeURIComponent(resource.resource_version)}`"
                  >发布版本</RouterLink
                >
                <t-button
                  v-if="kind === 'mcp' && resource.owner_type === 'system'"
                  size="small"
                  variant="text"
                  @click="editConnector(resource)"
                  >发布版本</t-button
                >
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AsyncState>
    <ConnectorConfigDialog
      :visible="connectorOpen"
      :resource="connector"
      system
      @close="connectorOpen = false"
      @saved="load"
    />
  </div>
</template>
<style scoped>
.management-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.management-table-wrap {
  overflow-x: auto;
}
.management-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}
.management-table th,
.management-table td {
  padding: 10px 12px;
  vertical-align: top;
  border-bottom: 1px solid var(--td-component-border);
}
.management-table small,
.management-entry {
  display: block;
  color: var(--td-text-color-secondary);
  margin-top: 4px;
}
.management-table td:last-child > * {
  margin-inline-end: 8px;
}
</style>
