<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";
import { useAdminPage } from "../../composables/useAdminPage";
import AsyncState from "../common/AsyncState.vue";
import AdminPagination from "./AdminPagination.vue";
import AdminSectionHeader from "./AdminSectionHeader.vue";
import AdminStatusBadge from "./AdminStatusBadge.vue";
import AdminTable from "./AdminTable.vue";
import GroupMembersTable from "./GroupMembersTable.vue";
interface Group {
  group_id: string;
  group_name: string;
  is_enabled: boolean;
}
type GroupRow = Group & { member_count: number };
const { data, loading, error, load, changePage } = useAdminPage((page) =>
  manager.adminPage<GroupRow>("groups", page),
);
const membersOf = ref<GroupRow>();
const open = ref(false),
  existing = ref(false),
  pending = ref(false),
  saveError = ref("");
const form = reactive<Group>({
  group_id: "",
  group_name: "",
  is_enabled: true,
});
onMounted(load);
function edit(group?: Group) {
  Object.assign(form, {
    group_id: group?.group_id ?? "",
    group_name: group?.group_name ?? "",
    is_enabled: group?.is_enabled ?? true,
  });
  existing.value = !!group;
  saveError.value = "";
  open.value = true;
}
async function save() {
  pending.value = true;
  saveError.value = "";
  try {
    await manager.adminSave(
      "groups",
      {
        group_name: form.group_name.trim(),
        is_enabled: form.is_enabled,
        ...(existing.value ? { group_id: form.group_id } : {}),
      },
      existing.value ? form.group_id : undefined,
    );
    open.value = false;
    await load();
  } catch (e) {
    saveError.value = errorText(e);
  } finally {
    pending.value = false;
  }
}
</script>
<template>
  <AdminSectionHeader title="用户组">
    <t-button theme="primary" @click="edit()">创建用户组</t-button>
  </AdminSectionHeader>
  <AsyncState
    :loading="loading"
    :error="error"
    :empty="!data?.items.length"
    empty-title="暂无用户组"
    empty-text="创建用户组后，可在用户页面为成员分组。"
    @retry="load"
  >
    <AdminTable label="用户组表格">
      <t-table
        :data="data?.items || []"
        row-key="group_id"
        :columns="[
          { colKey: 'group_name', title: '用户组' },
          { colKey: 'group_id', title: '组 ID' },
          { colKey: 'members', title: '成员' },
          { colKey: 'status', title: '状态' },
          { colKey: 'action', title: '操作', width: 90 },
        ]"
        hover
      >
        <template #members="{ row }">
          <t-button
            v-if="row.member_count > 0"
            size="small"
            variant="outline"
            theme="default"
            :aria-label="`查看成员（${row.member_count}） · ${row.group_name}`"
            @click="membersOf = row"
            >查看成员（{{ row.member_count }}）</t-button
          >
          <span v-else class="muted">暂无成员</span>
        </template>
        <template #status="{ row }">
          <AdminStatusBadge :tone="row.is_enabled ? 'success' : 'neutral'">
            {{ row.is_enabled ? "已启用" : "已停用" }}
          </AdminStatusBadge>
        </template>
        <template #action="{ row }">
          <t-button size="small" variant="outline" theme="default" @click="edit(row)"
            >编辑</t-button
          >
        </template>
      </t-table>
    </AdminTable>
  </AsyncState>
  <AdminPagination
    v-if="data?.items.length"
    label="用户组"
    :page="data.page"
    :has-next="data.has_next"
    :disabled="loading || pending"
    @change="changePage"
  />
  <t-dialog
    role="dialog"
    aria-modal="true"
    :aria-label="`${membersOf?.group_name || ''}成员`"
    :visible="!!membersOf"
    :header="`${membersOf?.group_name || ''}成员`"
    :footer="false"
    @close="membersOf = undefined"
  >
    <GroupMembersTable v-if="membersOf" :group-id="membersOf.group_id" />
  </t-dialog>
  <t-dialog
    role="dialog"
    aria-modal="true"
    :aria-label="existing ? '编辑用户组' : '创建用户组'"
    v-model:visible="open"
    :header="existing ? '编辑用户组' : '创建用户组'"
    :footer="false"
    ><form class="form-stack" @submit.prevent="save">
      <div v-if="existing" v-field-label class="field">
        <label>组 ID</label
        ><t-input :model-value="form.group_id" readonly />
      </div>
      <div v-field-label class="field">
        <label>组名称</label><t-input v-model="form.group_name" />
      </div>
      <t-checkbox v-model="form.is_enabled">启用用户组</t-checkbox>
      <div v-if="saveError" class="error">{{ saveError }}</div>
      <div class="form-actions">
        <t-button variant="outline" @click="open = false">取消</t-button
        ><t-button
          theme="primary"
          type="submit"
          :disabled="!form.group_name.trim()"
          :loading="pending"
          >保存用户组</t-button
        >
      </div>
    </form></t-dialog
  >
</template>
