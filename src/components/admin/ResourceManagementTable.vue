<script setup lang="ts">
import { onMounted, ref } from "vue";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";
import { useAdminPage } from "../../composables/useAdminPage";
import AdminPagination from "./AdminPagination.vue";
import AdminTable from "./AdminTable.vue";
import { principalName } from "../../types/api";
import type { AdminResource } from "../../types/api";
import AsyncState from "../common/AsyncState.vue";
import AdminSectionHeader from "./AdminSectionHeader.vue";
import AdminStatusBadge from "./AdminStatusBadge.vue";
import SystemSkillImportReviews from "./SystemSkillImportReviews.vue";

const { data, loading, error, load, changePage } = useAdminPage((page) =>
  manager.adminPage<AdminResource>("resources/skill", page),
);
const notice = ref("");
const pending = ref("");
onMounted(load);

async function toggle(resource: AdminResource) {
  pending.value = `${resource.resource_id}@${resource.resource_version}`;
  notice.value = "";
  try {
    await manager.setResourceAvailability(
      "skill",
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
</script>
<template>
  <div class="management-resources">
    <AdminSectionHeader title="技能">
      <RouterLink to="/skills/new?system=1">创建系统技能</RouterLink>
      <RouterLink to="/skills/upload?system=1">上传系统技能</RouterLink>
    </AdminSectionHeader>
    <SystemSkillImportReviews @changed="load" />
    <div v-if="notice" class="error" role="alert">{{ notice }}</div>
    <AsyncState
      :loading="loading"
      :error="error"
      :empty="!data?.items.length"
      empty-title="暂无技能"
      @retry="load"
    >
      <AdminTable label="技能表格" :min-width="670">
        <table class="management-table">
          <thead>
            <tr>
              <th scope="col">资源与版本</th>
              <th scope="col">状态</th>
              <th scope="col">绑定专家</th>
              <th scope="col">授权来源</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="resource in data?.items"
              :key="`${resource.resource_id}@${resource.resource_version}`"
            >
              <td>
                <strong>{{ resource.display_name }}</strong>
                <small
                  >{{ resource.resource_id }} ·
                  {{ resource.resource_version }}</small
                >
                <small>{{
                  resource.owner_type === "system"
                    ? "系统资源"
                    : resource.owner_id
                }}</small>
              </td>
              <td>
                <AdminStatusBadge
                  :tone="resource.is_available ? 'success' : 'neutral'"
                >
                  {{ resource.is_available ? "已启用" : "已停用" }}
                </AdminStatusBadge>
              </td>
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
                <div class="admin-actions">
                  <t-button
                    size="small"
                    variant="outline"
                    theme="default"
                    :disabled="!!pending"
                    @click="toggle(resource)"
                  >
                    {{ resource.is_available ? "停用" : "启用" }}
                  </t-button>
                  <RouterLink
                    v-if="resource.owner_type === 'system'"
                    :to="`/skills/${encodeURIComponent(resource.resource_id)}/edit?system=1&version=${encodeURIComponent(resource.resource_version || '')}`"
                    custom
                    v-slot="{ href, navigate }"
                  >
                    <t-button
                      size="small"
                      variant="outline"
                      theme="default"
                      :href="href"
                      @click="navigate"
                      >发布版本</t-button
                    >
                  </RouterLink>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </AdminTable>
    </AsyncState>
    <AdminPagination
      v-if="data?.items.length"
      label="技能"
      :page="data.page"
      :has-next="data.has_next"
      :disabled="loading || !!pending"
      @change="changePage"
    />
  </div>
</template>
<style scoped src="../../styles/components/management-table.css"></style>
