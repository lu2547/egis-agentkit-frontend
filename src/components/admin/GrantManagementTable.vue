<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";
import { useAsyncData } from "../../composables/useAsyncData";
import {
  principalName,
  type ShareableKind,
  type ShareTarget,
} from "../../types/api";
import AsyncState from "../common/AsyncState.vue";

interface Grant extends ShareTarget {
  id: string;
  resource_type: ShareableKind;
  resource_id: string;
  grant_source_type: "owner" | "manual" | "share" | "dependency";
  source_review_id?: string | null;
  root_grant_id?: string | null;
  parent_grant_id?: string | null;
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
function resourceKey(
  row: Pick<Grant, "resource_type" | "resource_id">,
) {
  return JSON.stringify([
    row.resource_type,
    row.resource_id,
  ]);
}
function recipientKey({ principal_type, principal_id }: ShareTarget) {
  return JSON.stringify([principal_type, principal_id]);
}
const { data, loading, error, load } = useAsyncData(async () => {
  const [grants, recipients, resources] = await Promise.all([
    manager.adminList<Grant>("grants"),
    manager.shareRecipients(),
    manager.grantResources(),
  ]);
  return {
    grants: grants.items,
    recipients: recipients.items.map(
      ({ principal_type, principal_id, display_name }) => ({
        value: recipientKey({ principal_type, principal_id }),
        name: display_name,
        label: `${display_name}（${principalName(principal_type, principal_id)}）`,
        target: { principal_type, principal_id },
      }),
    ),
    resources: resources.items.map(({ display_name, ...resource }) => ({
      value: resourceKey(resource),
      name: display_name,
      label: `${display_name} · ${resource.resource_type}`,
      resource,
    })),
  };
});
const open = ref(false);
const selectedResource = ref("");
const selectedRecipient = ref("");
const pending = ref(false);
const notice = ref("");
const grantsById = computed(
  () => new Map(data.value?.grants.map((grant) => [grant.id, grant])),
);

onMounted(load);

function openForm() {
  notice.value = "";
  selectedResource.value = "";
  selectedRecipient.value = "";
  open.value = true;
}

const resourceNames = computed(
  () => new Map(data.value?.resources.map(({ value, name }) => [value, name])),
);
const recipientNames = computed(
  () => new Map(data.value?.recipients.map(({ value, name }) => [value, name])),
);

function resourceName(row: Grant) {
  return resourceNames.value.get(resourceKey(row)) || row.resource_id;
}

function sourceLabel(row: Grant) {
  if (row.grant_source_type === "owner") return sourceNames.owner;
  if (row.grant_source_type !== "dependency") {
    return `${marketplaces[row.resource_type]} · ${sourceNames[row.grant_source_type]}`;
  }
  const parent =
    row.parent_grant_id && grantsById.value.get(row.parent_grant_id);
  return parent
    ? `${sourceNames.dependency} · ${resourceName(parent)}`
    : sourceNames.dependency;
}

function sourceId(row: Grant) {
  return row.parent_grant_id || row.source_review_id || row.id;
}

async function save() {
  const resource = data.value?.resources.find(
    (entry) => entry.value === selectedResource.value,
  );
  const recipient = data.value?.recipients.find(
    (entry) => entry.value === selectedRecipient.value,
  );
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
      ...recipient.target,
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
    <t-button theme="primary" @click="openForm">授予使用权限</t-button>
    <span class="muted">管理员发放的授权立即生效。</span>
  </div>
  <div v-if="notice && !open" class="error" role="alert">{{ notice }}</div>
  <AsyncState
    :loading="loading"
    :error="error"
    :empty="!data?.grants.length"
    @retry="load"
  >
    <t-table
      :data="data?.grants || []"
      row-key="id"
      :columns="[
        { colKey: 'principal', title: '授权对象' },
        { colKey: 'resource_id', title: '资源' },
        { colKey: 'resource_type', title: '类型' },
        { colKey: 'version', title: '版本' },
        { colKey: 'source', title: '来源' },
        { colKey: 'granted_by', title: '操作人' },
        { colKey: 'action', title: '操作', width: 110 },
      ]"
    >
      <template #principal="{ row }">
        <div v-if="recipientNames.get(recipientKey(row))">
          {{ recipientNames.get(recipientKey(row)) }}
        </div>
        <span class="muted">{{
          principalName(row.principal_type, row.principal_id)
        }}</span>
      </template>
      <template #resource_id="{ row }">
        <span :title="row.resource_id">{{ resourceName(row) }}</span>
      </template>
      <template #source="{ row }">
        <span class="badge">{{ sourceLabel(row) }}</span>
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
            variant="text"
            size="small"
            :disabled="pending || !!row.revoked_at"
          >
            {{ row.revoked_at ? "已撤销" : "撤销" }}
          </t-button>
        </t-popconfirm>
      </template>
    </t-table>
  </AsyncState>
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
          :options="data?.resources || []"
        />
      </div>
      <div v-field-label class="field">
        <label>授权对象</label>
        <t-select
          v-model="selectedRecipient"
          filterable
          :options="data?.recipients || []"
        />
      </div>
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
</template>
