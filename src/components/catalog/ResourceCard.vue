<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import {
  skillOwnerName,
  type Resource,
  type ResourceCatalog,
} from "../../types/api";
import CatalogAvatar from "../common/CatalogAvatar.vue";
import AppIcon from "../common/AppIcon.vue";
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
  menuOpen = ref(false),
  deleteOpen = ref(false),
  deleting = ref(false),
  authorizing = ref(false);
const selectionLabel = computed(() => {
  const action = !props.resource.is_installed
    ? "安装"
    : installation.enabled
      ? "停用"
      : "启用";
  return action + props.resource.display_name;
});
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
async function deleteSkill() {
  if (deleting.value) return;
  deleting.value = true;
  error.value = "";
  try {
    await manager.deleteSkill(props.resource.resource_id);
    deleteOpen.value = false;
    emit("changed");
  } catch (e) {
    error.value = errorText(e);
  } finally {
    deleting.value = false;
  }
}
function confirmSkillDeletion() {
  menuOpen.value = false;
  error.value = "";
  deleteOpen.value = true;
}
</script>
<template>
  <article class="sm-card" data-testid="catalog-card">
    <div class="sm-card-content">
      <CatalogAvatar
        class="sm-card-icon"
        :avatar="resource.payload.avatar"
        :name="resource.display_name"
        :skill="kind === 'skills' ? resource : undefined"
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
      <t-popup
        v-if="kind === 'skills' && (resource.is_editable || resource.is_deletable || resource.is_installed)"
        v-model:visible="menuOpen"
        trigger="click"
        placement="bottom-right"
      >
        <button
          type="button"
          class="sm-card-more"
          :aria-label="`${resource.display_name}的技能操作`"
          :aria-expanded="menuOpen"
          aria-haspopup="menu"
        >
          <AppIcon name="more" :size="16" />
        </button>
        <template #content>
          <div class="sm-skill-menu" role="menu">
            <button
              v-if="resource.is_editable"
              type="button"
              role="menuitem"
              @click="menuOpen = false; $emit('edit')"
            >
              <AppIcon name="edit" :size="15" />编辑
            </button>
            <button
              v-if="resource.is_installed"
              type="button"
              role="menuitem"
              :disabled="installation.pending || deleting"
              @click="menuOpen = false; removeSelection()"
            >
              <AppIcon name="close" :size="15" />取消选用
            </button>
            <button
              v-if="resource.is_deletable"
              type="button"
              role="menuitem"
              class="delete-skill"
              :disabled="deleting || installation.pending"
              @click="confirmSkillDeletion"
            >
              <AppIcon name="trash" :size="15" />删除
            </button>
          </div>
        </template>
      </t-popup>
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
    <div v-else-if="kind === 'skills'" class="sm-card-stats skill-card-footer">
      <span>{{ resource.version_label || resource.resource_version }}</span>
      <span class="skill-card-owner" :title="skillOwnerName(resource)">{{ skillOwnerName(resource) }}</span>
      <button
        type="button"
        :class="installation.enabled ? 'sm-card-installed-check' : 'sm-add-btn'"
        :disabled="!resource.is_usable || installation.pending || deleting"
        :aria-label="selectionLabel"
        :title="selectionLabel"
        @click="toggle"
      >
        <AppIcon :name="installation.enabled ? 'check' : 'plus'" :size="15" />
      </button>
    </div>
    <div v-else class="sm-card-stats">
      <span>{{ resource.version_label || resource.resource_version }}</span>
      <span>{{ resource.is_system_default ? "系统默认工具" : "专家工具" }}</span>
    </div>
    <div v-if="error && !deleteOpen" class="error" role="alert">{{ error }}</div>
    <t-dialog
      v-if="kind === 'skills' && resource.is_deletable"
      v-model:visible="deleteOpen"
      attach="body"
      destroy-on-close
      header="删除技能"
      role="dialog"
      aria-label="删除技能"
      :confirm-btn="{ content: '删除', theme: 'danger', loading: deleting }"
      :close-on-overlay-click="false"
      @confirm="deleteSkill"
    >
      <p>删除「{{ resource.display_name }}」的所有版本，并撤销选用和共享？</p>
      <div v-if="error" class="error" role="alert">{{ error }}</div>
    </t-dialog>
  </article>
</template>
<style scoped src="../../styles/components/resource-card.css"></style>
<style scoped>
.connector-actions {
  display: flex;
  gap: 6px;
  margin-inline-start: auto;
}
.sm-skill-menu .delete-skill {
  color: var(--danger);
}
</style>
