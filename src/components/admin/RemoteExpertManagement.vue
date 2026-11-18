<script setup lang="ts">
import { computed, onMounted } from "vue";
import { manager } from "../../api/manager";
import { useAsyncData } from "../../composables/useAsyncData";
import AsyncState from "../common/AsyncState.vue";
import AdminSectionHeader from "./AdminSectionHeader.vue";

const { data, loading, error, load } = useAsyncData(() => manager.definitions("agents"));
const rows = computed(() =>
  (data.value?.items ?? []).filter((row) => row.agent_type === "remote"),
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
    <RouterLink :to="{ path: '/experts/new', query: { execution: 'remote', returnTo: '/admin/remote-agents' } }">
      登记第三方专家
    </RouterLink>
  </AdminSectionHeader>
  <AsyncState :loading="loading" :error="error" :empty="!rows.length" empty-title="暂无第三方专家" @retry="load">
    <t-table
      :data="rows"
      row-key="id"
      :columns="[
        { colKey: 'agent_display_name', title: '专家' },
        { colKey: 'transport', title: '通信方式' },
        { colKey: 'action', title: '操作' },
      ]"
    >
      <template #transport="{ row }">
        {{ row.payload.remote_config ? transportNames[row.payload.remote_config.transport as keyof typeof transportNames] : '已登记' }}
      </template>
      <template #action="{ row }">
        <RouterLink :to="{ path: `/experts/${row.id}/edit`, query: { returnTo: '/admin/remote-agents', view: row.owner_type === 'system' ? 'system' : 'private' } }">编辑</RouterLink>
      </template>
    </t-table>
  </AsyncState>
</template>
