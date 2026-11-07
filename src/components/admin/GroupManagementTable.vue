<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";
import { useAsyncData } from "../../composables/useAsyncData";
import AsyncState from "../common/AsyncState.vue";
import type { User } from "../../types/api";
interface Group {
  group_id: string;
  group_name: string;
  is_enabled: boolean;
}
const { data, loading, error, load } = useAsyncData(async () => {
  const [groups, users] = await Promise.all([
    manager.adminList<Group>("groups"),
    manager.adminList<User>("users"),
  ]);
  return { groups: groups.items, users: users.items };
});
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
  Object.assign(
    form,
    group || { group_id: "", group_name: "", is_enabled: true },
  );
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
      form,
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
  <div class="toolbar">
    <t-button theme="primary" @click="edit()">创建用户组</t-button
    ><span class="muted help">在用户编辑中调整组成员。</span>
  </div>
  <AsyncState
    :loading="loading"
    :error="error"
    :empty="!data?.groups.length"
    @retry="load"
    ><t-table
      :data="data?.groups || []"
      row-key="group_id"
      :columns="[
        { colKey: 'group_name', title: '用户组' },
        { colKey: 'group_id', title: '组 ID' },
        { colKey: 'members', title: '成员' },
        { colKey: 'status', title: '状态' },
        { colKey: 'action', title: '操作', width: 90 },
      ]"
      hover
      ><template #members="{ row }">{{
        data?.users
          .filter((u) => u.group_ids.includes(row.group_id))
          .map((u) => u.username)
          .join("、") || "暂无成员"
      }}</template
      ><template #status="{ row }"
        ><span class="badge">{{
          row.is_enabled ? "启用" : "停用"
        }}</span></template
      ><template #action="{ row }"
        ><t-button size="small" variant="text" @click="edit(row)"
          >编辑</t-button
        ></template
      ></t-table
    ></AsyncState
  ><t-dialog
    role="dialog"
    aria-modal="true"
    :aria-label="existing ? '编辑用户组' : '创建用户组'"
    v-model:visible="open"
    :header="existing ? '编辑用户组' : '创建用户组'"
    :footer="false"
    ><form class="form-stack" @submit.prevent="save">
      <div v-field-label class="field">
        <label>组 ID</label
        ><t-input v-model="form.group_id" :disabled="existing" />
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
          :disabled="!form.group_id || !form.group_name"
          :loading="pending"
          >保存用户组</t-button
        >
      </div>
    </form></t-dialog
  >
</template>
<style scoped src="../../styles/components/GroupManagementTable.css"></style>
