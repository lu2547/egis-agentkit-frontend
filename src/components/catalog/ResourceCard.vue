<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import {
  skillOwnerName,
  type Resource,
  type ResourceCatalog,
} from "../../types/api";
import CatalogAvatar from "../common/CatalogAvatar.vue";
import { ResourceInstallation } from "../../domain/resourceState";
import { beginConnectorOAuth } from "../../domain/connectorAuthorization";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";
const props = defineProps<{
  resource: Resource;
  kind: ResourceCatalog;
}>();
const emit = defineEmits<{ detail: []; changed: []; edit: [] }>();
const installation = reactive(
    new ResourceInstallation(
      props.resource.is_enabled && props.resource.is_installed,
    ),
  ),
  error = ref(""),
  authorizing = ref(false);
watch(
  () => props.resource.is_enabled && props.resource.is_installed,
  (enabled) => (installation.enabled = enabled),
);
async function toggle() {
  const kind = props.kind;
  if (kind === "tools") return;
  error.value = "";
  try {
    const enabled = !installation.enabled;
    await installation.change(enabled, () =>
      props.resource.is_installed
        ? manager.toggle(kind, props.resource.resource_id, enabled)
        : manager.install(kind, props.resource.resource_id),
    );
    emit("changed");
  } catch (e) {
    error.value = errorText(e);
  }
}
async function connectorAction() {
  if (props.resource.is_authorized) {
    await toggle();
    return;
  }
  if (props.resource.auth_type !== "oauth") {
    emit("detail");
    return;
  }
  authorizing.value = true;
  error.value = "";
  try {
    await beginConnectorOAuth(props.resource.resource_id);
  } catch (err) {
    error.value = errorText(err);
  } finally {
    authorizing.value = false;
  }
}
async function removeSelection() {
  const kind = props.kind;
  if (kind === "tools") return;
  error.value = "";
  try {
    await installation.change(false, () =>
      manager.removeInstallation(kind, props.resource.resource_id),
    );
    emit("changed");
  } catch (e) {
    error.value = errorText(e);
  }
}
</script>
<template>
  <article class="sm-card" data-testid="catalog-card">
    <div class="sm-card-content">
      <CatalogAvatar
        class="sm-card-icon"
        :avatar="resource.payload.avatar"
        :name="resource.display_name"
      />
      <div class="sm-card-top">
        <button
          type="button"
          class="sm-card-body"
          :aria-label="`查看${resource.display_name}`"
          @click="$emit('detail')"
        >
          <span class="sm-card-name-row"
            ><span class="sm-card-name">{{ resource.display_name }}</span></span
          ><span class="sm-card-desc">{{ resource.description }}</span>
        </button>
      </div>
      <span v-if="kind === 'skills'" class="sm-add-btn-slot">
        <button
          type="button"
          :class="
            resource.is_installed ? 'sm-card-installed-check' : 'sm-add-btn'
          "
          :disabled="!resource.is_usable || installation.pending"
          :aria-label="`${resource.is_installed ? (installation.enabled ? '停用' : '启用') : '安装'}${resource.display_name}`"
          @click="toggle"
        >
          {{
            resource.is_installed ? (installation.enabled ? "✓" : "启用") : "+"
          }}
        </button>
      </span>
    </div>
    <div v-if="kind === 'connectors'" class="sm-card-stats">
      <span v-if="resource.auth_type === 'none'">无需授权</span>
      <span v-else>{{ resource.is_authorized ? "已授权" : "未授权" }}</span>
      <div class="connector-actions">
        <button
          v-if="!resource.is_authorized || !installation.enabled"
          type="button"
          class="edit"
          :disabled="!resource.is_usable || installation.pending || authorizing"
          @click="connectorAction"
        >
          {{ resource.is_authorized ? "添加" : "授权" }}
        </button>
        <button
          v-if="resource.is_installed"
          type="button"
          class="edit"
          :disabled="installation.pending || authorizing"
          @click="removeSelection"
        >
          取消添加
        </button>
      </div>
    </div>
    <div v-else class="sm-card-stats">
      <span>{{ resource.version_label || resource.resource_version }}</span
      ><span>{{
        kind === "tools"
          ? resource.is_system_default
            ? "系统默认工具"
            : "专家工具"
          : skillOwnerName(resource)
      }}</span
      ><button
        v-if="resource.is_installed && kind !== 'tools'"
        class="edit"
        :disabled="installation.pending"
        @click="removeSelection"
      >
        取消选用</button
      ><button
        v-if="resource.is_editable && kind !== 'tools'"
        class="edit"
        @click="$emit('edit')"
      >
        编辑
      </button>
    </div>
    <div v-if="error" class="error" role="alert">{{ error }}</div>
  </article>
</template>
<style scoped src="../../styles/components/resource-card.css"></style>
<style scoped>
.connector-actions {
  display: flex;
  gap: 6px;
  margin-inline-start: auto;
}
</style>
