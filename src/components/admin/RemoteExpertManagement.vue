<script setup lang="ts">
import { onMounted } from "vue";
import type { Definition } from "../../types/api";
import { manager } from "../../api/manager";
import { useAdminPage } from "../../composables/useAdminPage";
import AdminPagination from "./AdminPagination.vue";
import AdminTable from "./AdminTable.vue";
import AsyncState from "../common/AsyncState.vue";
import AdminSectionHeader from "./AdminSectionHeader.vue";

const { data, loading, error, load, changePage } = useAdminPage((page) =>
  manager.adminPage<Definition>("remote-agents", page),
);
const transportNames = {
  http_sync: "同步 HTTP",
  http_callback: "异步 HTTP 回调",
  websocket: "WebSocket",
};
onMounted(load);
</script>

<template>
  <AdminSectionHeader title="第三方专家">
    <RouterLink
      :to="{
        path: '/experts/new',
        query: { execution: 'remote', returnTo: '/admin/remote-agents' },
      }"
    >
      登记第三方专家
    </RouterLink>
  </AdminSectionHeader>
  <AsyncState
    :loading="loading"
    :error="error"
    :empty="!data?.items.length"
    empty-title="暂无第三方专家"
    @retry="load"
  >
    <AdminTable label="第三方专家表格">
      <t-table
        :data="data?.items || []"
        row-key="id"
        :columns="[
          { colKey: 'agent_display_name', title: '专家' },
          { colKey: 'transport', title: '通信方式' },
          { colKey: 'action', title: '操作', width: 90 },
        ]"
      >
        <template #transport="{ row }">
          {{
            row.payload.remote_config
              ? transportNames[
                  row.payload.remote_config
                    .transport as keyof typeof transportNames
                ]
              : "已登记"
          }}
        </template>
        <template #action="{ row }">
          <RouterLink
            :to="{
              path: `/experts/${row.id}/edit`,
              query: {
                returnTo: '/admin/remote-agents',
                view: row.owner_type === 'system' ? 'system' : 'private',
              },
            }"
            custom
            v-slot="{ href, navigate }"
          >
            <t-button
              size="small"
              variant="outline"
              theme="default"
              :href="href"
              @click="navigate"
              >编辑</t-button
            >
          </RouterLink>
        </template>
      </t-table>
    </AdminTable>
  </AsyncState>
  <AdminPagination
    v-if="data?.items.length"
    label="第三方专家"
    :page="data.page"
    :has-next="data.has_next"
    :disabled="loading"
    @change="changePage"
  />
</template>
