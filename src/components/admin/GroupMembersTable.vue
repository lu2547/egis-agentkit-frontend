<script setup lang="ts">
import { onMounted } from "vue";
import { manager } from "../../api/manager";
import { useAdminPage } from "../../composables/useAdminPage";
import type { User } from "../../types/api";
import AsyncState from "../common/AsyncState.vue";
import AdminPagination from "./AdminPagination.vue";
import AdminTable from "./AdminTable.vue";

const props = defineProps<{ groupId: string }>();
const { data, loading, error, load, changePage } = useAdminPage((page) =>
  manager.adminPage<User>("users", page, { group_id: props.groupId }),
);
onMounted(load);
</script>

<template>
  <AsyncState
    :loading="loading"
    :error="error"
    :empty="!data?.items.length"
    empty-title="暂无成员"
    @retry="load"
  >
    <AdminTable
      class="group-members-table"
      label="用户组成员表格"
      :min-width="330"
    >
      <t-table
        :data="data?.items || []"
        row-key="user_id"
        :columns="[
          { colKey: 'username', title: '用户' },
          { colKey: 'user_id', title: '用户 ID' },
        ]"
      />
    </AdminTable>
  </AsyncState>
  <AdminPagination
    v-if="data?.items.length"
    label="用户组成员"
    :page="data.page"
    :has-next="data.has_next"
    :disabled="loading"
    @change="changePage"
  />
</template>

<style scoped>
.group-members-table {
  max-height: min(55vh, 480px);
}
</style>
