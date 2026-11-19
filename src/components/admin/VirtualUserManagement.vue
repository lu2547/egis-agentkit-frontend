<script setup lang="ts">
import { onMounted, ref } from "vue";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";
import { useAdminPage } from "../../composables/useAdminPage";
import AdminPagination from "./AdminPagination.vue";
import AdminStatusBadge from "./AdminStatusBadge.vue";
import AdminTable from "./AdminTable.vue";
import type { VirtualUser } from "../../types/api";
import AsyncState from "../common/AsyncState.vue";

const { data, loading, error, load, changePage } = useAdminPage((page) =>
  manager.adminPage<VirtualUser>("virtual-users", page),
);
const creating = ref(false);
const rotating = ref<VirtualUser | null>(null);
const name = ref("");
const token = ref("");
const pending = ref(false);
const notice = ref("");
onMounted(load);

function startCreate() {
  name.value = "";
  notice.value = "";
  creating.value = true;
}

async function change(operation: () => Promise<void>) {
  if (pending.value) return;
  pending.value = true;
  notice.value = "";
  try {
    await operation();
    await load();
  } catch (error) {
    notice.value = errorText(error);
  } finally {
    pending.value = false;
  }
}

function create() {
  return change(async () => {
    const account = await manager.createVirtualUser(name.value.trim());
    creating.value = false;
    token.value = account.token;
  });
}

function rotate() {
  const account = rotating.value;
  if (!account) return;
  return change(async () => {
    const updated = await manager.rotateVirtualUser(account.user_id);
    rotating.value = null;
    token.value = updated.token;
  });
}

function toggle(account: VirtualUser) {
  return change(async () => {
    await manager.setVirtualUserEnabled(account.user_id, !account.is_enabled);
  });
}
</script>

<template>
  <section class="virtual-users" aria-label="虚拟用户">
    <div class="virtual-user-heading">
      <h2>虚拟用户</h2>
      <t-button variant="outline" @click="startCreate">添加虚拟用户</t-button>
    </div>
    <p v-if="notice" class="error" role="alert">{{ notice }}</p>
    <AsyncState :loading="loading" :error="error" @retry="load">
      <AdminTable label="虚拟用户表格">
        <t-table
          :data="data?.items || []"
          row-key="user_id"
          :columns="[
            { colKey: 'username', title: '对接系统' },
            { colKey: 'user_id', title: '用户 ID' },
            { colKey: 'enabled', title: '状态' },
            { colKey: 'action', title: '操作', width: 190 },
          ]"
        >
          <template #enabled="{ row }">
            <AdminStatusBadge :tone="row.is_enabled ? 'success' : 'neutral'">
              {{ row.is_enabled ? "已启用" : "已停用" }}
            </AdminStatusBadge>
          </template>
          <template #action="{ row }">
            <div class="admin-actions">
              <t-button
                size="small"
                variant="outline"
                theme="default"
                :disabled="pending"
                @click="toggle(row)"
              >
                {{ row.is_enabled ? "停用" : "启用" }}
              </t-button>
              <t-button
                size="small"
                variant="outline"
                theme="default"
                :disabled="pending"
                @click="rotating = row"
              >
                更新凭证
              </t-button>
            </div>
          </template>
        </t-table>
      </AdminTable>
    </AsyncState>
    <AdminPagination
      v-if="data?.items.length"
      label="虚拟用户"
      :page="data.page"
      :has-next="data.has_next"
      :disabled="loading || pending"
      @change="changePage"
    />
    <t-dialog v-model:visible="creating" header="添加虚拟用户" :footer="false">
      <form class="form-stack" @submit.prevent="create">
        <div class="field">
          <label for="virtual-user-name">对接系统名称</label>
          <input
            id="virtual-user-name"
            v-model.trim="name"
            maxlength="128"
            required
          />
        </div>
        <p v-if="notice" class="error" role="alert">{{ notice }}</p>
        <div class="form-actions">
          <t-button variant="outline" @click="creating = false">取消</t-button>
          <t-button type="submit" :loading="pending" :disabled="!name"
            >签发凭证</t-button
          >
        </div>
      </form>
    </t-dialog>
    <t-dialog
      :visible="!!rotating"
      header="更新虚拟用户凭证"
      :confirm-btn="{ content: '更新凭证', loading: pending }"
      @confirm="rotate"
      @close="rotating = null"
    >
      <p>更新后，{{ rotating?.username }} 的现有凭证将立即失效。</p>
      <p v-if="notice" class="error" role="alert">{{ notice }}</p>
    </t-dialog>
    <t-dialog
      v-if="token"
      :visible="true"
      header="虚拟用户凭证"
      :footer="false"
      @close="token = ''"
    >
      <div class="field">
        <label for="virtual-user-token">凭证仅显示一次，请复制后再关闭。</label>
        <input
          id="virtual-user-token"
          :value="token"
          readonly
          @focus="($event.target as HTMLInputElement).select()"
        />
      </div>
      <div class="form-actions">
        <t-button variant="outline" @click="token = ''">关闭</t-button>
      </div>
    </t-dialog>
  </section>
</template>

<style scoped>
.virtual-users {
  margin-block-start: 32px;
}
.virtual-user-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-block-end: 12px;
}
.virtual-user-heading h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
</style>
