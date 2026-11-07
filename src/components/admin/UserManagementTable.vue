<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import type { User } from "../../types/api";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";
import { useAsyncData } from "../../composables/useAsyncData";
import AsyncState from "../common/AsyncState.vue";
const { data, loading, error, load } = useAsyncData(() =>
  manager.adminList<User>("users"),
);
const editing = ref(false),
  pending = ref(false),
  saveError = ref(""),
  groups = ref<{ group_id: string; group_name: string }[]>([]);
const form = reactive<User>({
  user_id: "",
  username: "",
  role_type: "user",
  group_ids: [],
  is_enabled: true,
});
onMounted(() => {
  void load();
  void manager
    .adminList<{ group_id: string; group_name: string }>("groups")
    .then((x) => (groups.value = x.items))
    .catch(() => {});
});
function edit(user: User) {
  Object.assign(form, structuredClone(user));
  editing.value = true;
  saveError.value = "";
}
async function save() {
  pending.value = true;
  saveError.value = "";
  try {
    await manager.adminSave("users", form, form.user_id);
    editing.value = false;
    await load();
  } catch (e) {
    saveError.value = errorText(e);
  } finally {
    pending.value = false;
  }
}
</script>
<template>
  <AsyncState
    :loading="loading"
    :error="error"
    :empty="!data?.items.length"
    @retry="load"
    ><t-table
      :data="data?.items || []"
      row-key="user_id"
      :columns="[
        { colKey: 'username', title: '用户' },
        { colKey: 'user_id', title: '用户 ID' },
        { colKey: 'role_type', title: '角色' },
        { colKey: 'groups', title: '所属组' },
        { colKey: 'status', title: '状态' },
        { colKey: 'action', title: '操作', width: 90 },
      ]"
      hover
      ><template #role_type="{ row }">{{
        row.role_type === "admin" ? "管理员" : "用户"
      }}</template
      ><template #groups="{ row }">{{
        row.group_ids?.join("、") || "无"
      }}</template
      ><template #status="{ row }"
        ><span class="badge" :class="{ green: row.is_enabled }">{{
          row.is_enabled ? "启用" : "停用"
        }}</span></template
      ><template #action="{ row }"
        ><t-button variant="text" size="small" @click="edit(row)"
          >编辑</t-button
        ></template
      ></t-table
    ></AsyncState
  ><t-dialog
    role="dialog"
    aria-modal="true"
    aria-label="编辑用户"
    v-model:visible="editing"
    header="编辑用户"
    :footer="false"
    ><form class="form-stack" @submit.prevent="save">
      <div v-field-label class="field">
        <label>用户 ID</label><t-input v-model="form.user_id" disabled />
      </div>
      <div v-field-label class="field">
        <label>名称</label><t-input v-model="form.username" />
      </div>
      <div v-field-label class="field">
        <label>角色</label
        ><t-select
          v-model="form.role_type"
          :options="[
            { label: '用户', value: 'user' },
            { label: '管理员', value: 'admin' },
          ]"
        />
      </div>
      <div v-field-label class="field">
        <label>所属组</label
        ><t-select
          v-model="form.group_ids"
          multiple
          :options="
            groups.map((g) => ({ label: g.group_name, value: g.group_id }))
          "
        />
      </div>
      <t-checkbox v-model="form.is_enabled">启用用户</t-checkbox>
      <div v-if="saveError" class="error">{{ saveError }}</div>
      <div class="form-actions">
        <t-button variant="outline" @click="editing = false">取消</t-button
        ><t-button theme="primary" type="submit" :loading="pending"
          >保存用户</t-button
        >
      </div>
    </form></t-dialog
  >
</template>
