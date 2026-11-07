<script setup lang="ts">
import { ref, onMounted, reactive } from "vue";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";
import { useAsyncData } from "../../composables/useAsyncData";
import AsyncState from "../common/AsyncState.vue";
const { data, loading, error, load } = useAsyncData(() =>
  manager.adminList<Record<string, unknown>>("packages"),
);
const open = ref(false),
  pending = ref(false),
  notice = ref("");
const form = reactive({
  package_path: "",
  assembly_ref: "",
  assembly_version: "",
  entrypoint: "",
  owner_id: "system",
});
onMounted(load);
async function submit() {
  pending.value = true;
  notice.value = "";
  try {
    await manager.adminSave("packages", form);
    open.value = false;
    await load();
  } catch (e) {
    notice.value = errorText(e);
  } finally {
    pending.value = false;
  }
}
function packagePath(item: Record<string, unknown>) {
  return (
    (item.payload as Record<string, unknown>)?.path ||
    item.path ||
    item.entrypoint
  );
}
async function disable(item: Record<string, unknown>) {
  pending.value = true;
  notice.value = "";
  try {
    await manager.disablePackage(
      String(item.resource_id || item.id),
      String(item.resource_version || item.version),
    );
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
      >加载发布包</t-button
    ><span class="muted" style="font-size: 11px"
      >每个版本独立加载，现有会话保留原执行版本。</span
    >
  </div>
  <div v-if="notice && !open" class="error">{{ notice }}</div>
  <AsyncState
    :loading="loading"
    :error="error"
    :empty="!data?.items.length"
    @retry="load"
    ><div
      v-for="item in data?.items"
      :key="`${item.resource_id}-${item.resource_version}`"
      class="package-row"
    >
      <div>
        <strong>{{ item.resource_id || item.id }}</strong
        ><span class="badge">{{ item.resource_version || item.version }}</span>
        <p v-if="item.error" class="error">{{ item.error }}</p>
        <p>{{ packagePath(item) }}</p>
      </div>
      <span class="badge" :class="{ green: item.is_enabled !== false }">{{
        item.is_enabled === false
          ? "已停用"
          : item.is_loaded
            ? "已加载"
            : "未加载"
      }}</span
      ><t-popconfirm
        content="停用后，新任务将不能使用此发布包。"
        @confirm="disable(item)"
        ><t-button
          variant="text"
          size="small"
          :disabled="pending || item.is_enabled === false"
          >停用</t-button
        ></t-popconfirm
      >
    </div></AsyncState
  ><t-dialog
    role="dialog"
    aria-modal="true"
    aria-label="加载发布包"
    v-model:visible="open"
    header="加载发布包"
    :footer="false"
    ><form class="form-stack" @submit.prevent="submit">
      <div v-field-label class="field">
        <label>服务端包路径</label
        ><t-input
          v-model="form.package_path"
          placeholder="输入服务端可访问的包目录"
        /><small>路径由服务端验证，加载失败不会替换已生效版本。</small>
      </div>
      <div class="form-row">
        <div v-field-label class="field">
          <label>Assembly</label
          ><t-input
            v-model="form.assembly_ref"
            placeholder="office.assistant"
          />
        </div>
        <div v-field-label class="field">
          <label>Version</label
          ><t-input v-model="form.assembly_version" placeholder="1.0.0" />
        </div>
      </div>
      <div v-field-label class="field">
        <label>Entrypoint</label
        ><t-input v-model="form.entrypoint" placeholder="package:register" />
      </div>
      <div v-if="notice" class="error">{{ notice }}</div>
      <div class="form-actions">
        <t-button variant="outline" @click="open = false">取消</t-button
        ><t-button
          theme="primary"
          type="submit"
          :disabled="
            !form.package_path ||
            !form.assembly_ref ||
            !form.assembly_version ||
            !form.entrypoint
          "
          :loading="pending"
          >加载并验证</t-button
        >
      </div>
    </form></t-dialog
  >
</template>
<style scoped src="../../styles/components/PackageReleaseList.css"></style>
