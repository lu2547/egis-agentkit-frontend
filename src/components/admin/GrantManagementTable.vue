<script setup lang="ts">
import { ref, reactive, onMounted, computed } from "vue";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";
import { useAsyncData } from "../../composables/useAsyncData";
import { definitionName, type User } from "../../types/api";
import AsyncState from "../common/AsyncState.vue";
interface Grant {
  id: string;
  principal_type: string;
  principal_id: string;
  resource_type: string;
  resource_id: string;
  resource_view_type: string;
  resource_owner_type: string;
  resource_owner_id: string;
  grant_source_type: string;
  revoked_at?: string | null;
}
interface Choice {
  key: string;
  label: string;
  resource_type: string;
  resource_id: string;
  resource_view_type: string;
  resource_owner_type: string;
  resource_owner_id: string;
}
const { data, loading, error, load } = useAsyncData(async () => {
  const [grants, users, groups, agents, teams, skills, connectors] =
    await Promise.all([
      manager.adminList<Grant>("grants"),
      manager.adminList<User>("users"),
      manager.adminList<{ group_id: string; group_name: string }>("groups"),
      manager.definitions("agents"),
      manager.definitions("teams"),
      manager.resources("skills"),
      manager.resources("connectors"),
    ]);
  const choices: Choice[] = [...agents.items, ...teams.items]
    .filter((d) => d.resource_view_type !== "private")
    .map((d) => ({
      key: `${d.definition_type}|${d.id}|${d.resource_view_type}`,
      label: definitionName(d),
      resource_type: d.definition_type,
      resource_id: d.id,
      resource_view_type: d.resource_view_type,
      resource_owner_type: d.owner_type,
      resource_owner_id: d.owner_id,
    }));
  for (const [kind, list] of [
    ["skill", skills.items],
    ["mcp", connectors.items],
  ] as const)
    for (const r of list)
      if ((r.resource_view_type || "system") !== "private")
        choices.push({
          key: `${kind}|${r.resource_id}|${r.resource_view_type || "system"}`,
          label: r.display_name,
          resource_type: kind,
          resource_id: r.resource_id,
          resource_view_type: r.resource_view_type || "system",
          resource_owner_type: r.owner_type,
          resource_owner_id: r.owner_id,
        });
  return {
    grants: grants.items,
    users: users.items,
    groups: groups.items,
    choices,
  };
});
const open = ref(false),
  selected = ref(""),
  pending = ref(false),
  notice = ref("");
const form = reactive({ principal_type: "all_users", principal_id: "" });
const principals = computed(() =>
  form.principal_type === "user"
    ? data.value?.users.map((u) => ({ label: u.username, value: u.user_id }))
    : data.value?.groups.map((g) => ({
        label: g.group_name,
        value: g.group_id,
      })),
);
onMounted(load);
async function save() {
  const choice = data.value?.choices.find((c) => c.key === selected.value);
  if (!choice) return;
  pending.value = true;
  notice.value = "";
  try {
    const { key, label, ...resource } = choice;
    await manager.adminSave("grants", {
      ...resource,
      ...form,
      principal_id:
        form.principal_type === "all_users" ? "*" : form.principal_id,
    });
    open.value = false;
    await load();
  } catch (e) {
    notice.value = errorText(e);
  } finally {
    pending.value = false;
  }
}
async function revoke(grant: Grant) {
  pending.value = true;
  notice.value = "";
  try {
    await manager.adminDelete("grants", grant.id);
    await load();
  } catch (e) {
    notice.value = errorText(e);
  } finally {
    pending.value = false;
  }
}
</script>
<template>
  <div class="toolbar">
    <t-button
      theme="primary"
      @click="
        open = true;
        notice = '';
      "
      >授予使用权限</t-button
    ><span class="muted" style="font-size: 11px"
      >默认无授权。资源使用仅授予 USE。</span
    >
  </div>
  <div v-if="notice && !open" class="error">{{ notice }}</div>
  <AsyncState
    :loading="loading"
    :error="error"
    :empty="!data?.grants.length"
    @retry="load"
    ><t-table
      :data="data?.grants || []"
      row-key="id"
      :columns="[
        { colKey: 'principal', title: '授权对象' },
        { colKey: 'resource_id', title: '资源' },
        { colKey: 'resource_type', title: '类型' },
        { colKey: 'source', title: '来源' },
        { colKey: 'action', title: '操作', width: 90 },
      ]"
      ><template #principal="{ row }">{{
        row.principal_type === "all_users" ? "全部用户" : row.principal_id
      }}</template
      ><template #source="{ row }"
        ><span class="badge">{{
          row.grant_source_type === "share" ? "共享审核" : "管理员授权"
        }}</span></template
      ><template #action="{ row }"
        ><t-popconfirm
          content="撤销此来源的使用授权？其他来源将保留。"
          @confirm="revoke(row)"
          ><t-button
            variant="text"
            size="small"
            :disabled="pending || !!row.revoked_at"
            >{{ row.revoked_at ? "已撤销" : "撤销" }}</t-button
          ></t-popconfirm
        ></template
      ></t-table
    ></AsyncState
  ><t-dialog
    role="dialog"
    aria-modal="true"
    aria-label="授予 USE 使用权限"
    v-model:visible="open"
    header="授予 USE 使用权限"
    :footer="false"
    ><form class="form-stack" @submit.prevent="save">
      <div v-field-label class="field">
        <label>资源</label
        ><t-select
          v-model="selected"
          filterable
          :options="
            data?.choices.map((c) => ({
              label: `${c.label} · ${c.resource_type} · ${c.resource_view_type}`,
              value: c.key,
            })) || []
          "
        />
      </div>
      <div v-field-label class="field">
        <label>授权对象类型</label
        ><t-select
          v-model="form.principal_type"
          :options="[
            { label: '全部用户', value: 'all_users' },
            { label: '指定用户', value: 'user' },
            { label: '用户组', value: 'group' },
          ]"
          @change="form.principal_id = ''"
        />
      </div>
      <div
        v-if="form.principal_type !== 'all_users'"
        v-field-label
        class="field"
      >
        <label>授权对象</label
        ><t-select
          v-model="form.principal_id"
          filterable
          :options="principals || []"
        />
      </div>
      <div v-if="notice" class="error">{{ notice }}</div>
      <div class="form-actions">
        <t-button variant="outline" @click="open = false">取消</t-button
        ><t-button
          theme="primary"
          type="submit"
          :disabled="
            !selected ||
            (form.principal_type !== 'all_users' && !form.principal_id)
          "
          :loading="pending"
          >授予使用权限</t-button
        >
      </div>
    </form></t-dialog
  >
</template>
