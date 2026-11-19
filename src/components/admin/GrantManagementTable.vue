<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";
import { useAdminPage } from "../../composables/useAdminPage";
import { useAsyncData } from "../../composables/useAsyncData";
import {
  principalName,
  type ShareableKind,
  type ShareTarget,
} from "../../types/api";
import AsyncState from "../common/AsyncState.vue";
import RecipientPicker from "../common/RecipientPicker.vue";
import AdminPagination from "./AdminPagination.vue";
import AdminSectionHeader from "./AdminSectionHeader.vue";
import AdminStatusBadge from "./AdminStatusBadge.vue";
import AdminTable from "./AdminTable.vue";
import BatchSkillShareDialog from "../skills/BatchSkillShareDialog.vue";

interface Grant extends ShareTarget {
  id: string;
  resource_type: ShareableKind;
  resource_id: string;
  grant_source_type: "owner" | "manual" | "share" | "dependency";
  source_review_id?: string | null;
  root_grant_id?: string | null;
  parent_grant_id?: string | null;
  parent_resource_type?: ShareableKind | null;
  parent_resource_id?: string | null;
  principal_display_name?: string | null;
  granted_by: string;
  revoked_at?: string | null;
}

const sourceNames = {
  owner: "资源归属",
  manual: "管理员直接授权",
  share: "共享审批",
  dependency: "依赖授权",
};
const marketplaces: Record<ShareableKind, string> = {
  agent: "专家广场",
  team: "专家团广场",
  skill: "技能广场",
  mcp: "连接器广场",
};
function resourceKey(row: Pick<Grant, "resource_type" | "resource_id">) {
  return JSON.stringify([row.resource_type, row.resource_id]);
}
const {
  data,
  loading,
  error,
  load: loadPage,
  changePage,
} = useAdminPage((page) => manager.adminPage<Grant>("grants", page));
const {
  data: options,
  loading: loadingOptions,
  error: optionsError,
  load: loadOptions,
} = useAsyncData(async () => {
  const resources = await manager.grantResources();
  return {
    resources: resources.items.map(({ display_name, ...resource }) => ({
      value: resourceKey(resource),
      name: display_name,
      label: `${display_name} · ${resource.resource_type}`,
      resource,
    })),
  };
});
const open = ref(false);
const batchOpen = ref(false);
const selectedResource = ref("");
const selectedRecipient = ref<ShareTarget | null>(null);
const pending = ref(false);
const notice = ref("");
const systemSkills = computed(() =>
  (options.value?.resources || [])
    .filter(
      ({ resource }) =>
        resource.resource_type === "skill" &&
        resource.resource_view_type === "system",
    )
    .map(({ resource, name }) => ({ ...resource, display_name: name })),
);

async function load() {
  await Promise.all([loadPage(), options.value ? undefined : loadOptions()]);
}

onMounted(load);

function openForm() {
  notice.value = "";
  selectedResource.value = "";
  selectedRecipient.value = null;
  open.value = true;
}

const resourceNames = computed(
  () =>
    new Map(options.value?.resources.map(({ value, name }) => [value, name])),
);

function resourceName(row: Pick<Grant, "resource_type" | "resource_id">) {
  return resourceNames.value.get(resourceKey(row)) || row.resource_id;
}

function sourceLabel(row: Grant) {
  if (row.grant_source_type === "owner") return sourceNames.owner;
  if (row.grant_source_type !== "dependency") {
    return `${marketplaces[row.resource_type]} · ${sourceNames[row.grant_source_type]}`;
  }
  const { parent_resource_type, parent_resource_id } = row;
  return parent_resource_type && parent_resource_id
    ? `${sourceNames.dependency} · ${resourceName({ resource_type: parent_resource_type, resource_id: parent_resource_id })}`
    : sourceNames.dependency;
}

function sourceId(row: Grant) {
  return row.parent_grant_id || row.source_review_id || row.id;
}

async function save() {
  const resource = options.value?.resources.find(
    (entry) => entry.value === selectedResource.value,
  );
  const recipient = selectedRecipient.value;
  if (!resource || !recipient) return;
  pending.value = true;
  notice.value = "";
  try {
    await manager.adminSave("grants", {
      resource_type: resource.resource.resource_type,
      resource_id: resource.resource.resource_id,
      resource_view_type: resource.resource.resource_view_type,
      resource_owner_type: resource.resource.resource_owner_type,
      resource_owner_id: resource.resource.resource_owner_id,
      ...recipient,
    });
    open.value = false;
    await load();
  } catch (e) {
    notice.value = errorText(e);
  } finally {
    pending.value = false;
  }
}

function grantSkills(resourceIds: string[], target: ShareTarget) {
  const skillsById = new Map(
    systemSkills.value.map((skill) => [skill.resource_id, skill]),
  );
  const resources = resourceIds.map((resource_id) => {
    const skill = skillsById.get(resource_id);
    if (!skill) throw new Error("技能列表已更新，请重新选择。");
    return { resource_id, resource_owner_id: skill.resource_owner_id };
  });
  return manager.grantSkills(resources, target);
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
  <AdminSectionHeader title="使用授权">
    <t-button theme="primary" @click="openForm">授予使用权限</t-button>
    <t-button
      variant="outline"
      :disabled="!systemSkills.length"
      @click="batchOpen = true"
    >
      批量授权技能
    </t-button>
  </AdminSectionHeader>
  <div v-if="notice && !open" class="error" role="alert">{{ notice }}</div>
  <AsyncState
    :loading="loading || loadingOptions"
    :error="error || optionsError"
    :empty="!data?.items.length"
    @retry="load"
  >
    <AdminTable label="使用授权表格" :min-width="650">
      <t-table
        :data="data?.items || []"
        row-key="id"
        :columns="[
          { colKey: 'principal', title: '授权对象' },
          { colKey: 'resource_id', title: '资源' },
          { colKey: 'resource_type', title: '类型' },
          { colKey: 'source', title: '来源' },
          { colKey: 'granted_by', title: '操作人' },
          { colKey: 'action', title: '操作', width: 110 },
        ]"
      >
        <template #principal="{ row }">
          <div v-if="row.principal_display_name">
            {{ row.principal_display_name }}
          </div>
          <span class="muted">{{
            principalName(row.principal_type, row.principal_id)
          }}</span>
        </template>
        <template #resource_id="{ row }">
          <span :title="row.resource_id">{{ resourceName(row) }}</span>
        </template>
        <template #source="{ row }">
          <AdminStatusBadge>{{ sourceLabel(row) }}</AdminStatusBadge>
          <div class="muted" :title="sourceId(row)">
            {{ sourceId(row).slice(0, 12) }}
          </div>
        </template>
        <template #action="{ row }">
          <span v-if="row.grant_source_type === 'owner'" class="muted"
            >所有者权限</span
          >
          <span v-else-if="row.root_grant_id" class="muted">{{
            row.revoked_at ? "已撤销" : "随根授权"
          }}</span>
          <t-popconfirm
            v-else
            content="撤销此来源的使用授权？"
            @confirm="revoke(row)"
          >
            <t-button
              variant="outline"
              theme="danger"
              size="small"
              :disabled="pending || !!row.revoked_at"
            >
              {{ row.revoked_at ? "已撤销" : "撤销" }}
            </t-button>
          </t-popconfirm>
        </template>
      </t-table>
    </AdminTable>
  </AsyncState>
  <AdminPagination
    v-if="data?.items.length"
    label="使用授权"
    :page="data.page"
    :has-next="data.has_next"
    :disabled="loading || loadingOptions || pending"
    @change="changePage"
  />
  <t-dialog
    role="dialog"
    aria-modal="true"
    aria-label="授予使用权限"
    v-model:visible="open"
    header="授予使用权限"
    :footer="false"
  >
    <form class="form-stack" @submit.prevent="save">
      <div v-field-label class="field">
        <label>资源</label>
        <t-select
          v-model="selectedResource"
          filterable
          :options="options?.resources || []"
        />
      </div>
      <RecipientPicker
        v-if="open"
        v-model="selectedRecipient"
        label="授权对象"
        :disabled="pending"
      />
      <div v-if="notice" class="error" role="alert">{{ notice }}</div>
      <div class="form-actions">
        <t-button variant="outline" @click="open = false">取消</t-button>
        <t-button
          theme="primary"
          type="submit"
          :disabled="!selectedResource || !selectedRecipient"
          :loading="pending"
        >
          授予使用权限
        </t-button>
      </div>
    </form>
  </t-dialog>
  <BatchSkillShareDialog
    :visible="batchOpen"
    title="批量授权技能"
    submit-label="授予使用权限"
    :resources="systemSkills"
    :submit-batch="grantSkills"
    @close="batchOpen = false"
    @changed="load"
  />
</template>
