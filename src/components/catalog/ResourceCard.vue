<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import type { Resource, ResourceCatalog } from "../../types/api";
import CatalogAvatar from "../common/CatalogAvatar.vue";
import { ResourceInstallation } from "../../domain/resourceState";
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
  error = ref("");
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
        ? manager.toggle(
            kind,
            props.resource.resource_id,
            props.resource.resource_version,
            enabled,
          )
        : manager.install(
            kind,
            props.resource.resource_id,
            props.resource.resource_version,
          ),
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
      <CatalogAvatar class="sm-card-icon" :avatar="resource.payload.avatar" :name="resource.display_name" />
      <div class="sm-card-top"><button type="button" class="sm-card-body" :aria-label="`查看${resource.display_name}`" @click="$emit('detail')"><span class="sm-card-name-row"><span class="sm-card-name">{{ resource.display_name }}</span></span><span class="sm-card-desc">{{ resource.description }}</span></button></div>
      <span v-if="kind !== 'tools'" class="sm-add-btn-slot">
        <button type="button" :class="resource.is_installed ? 'sm-card-installed-check' : 'sm-add-btn'" :disabled="!resource.is_usable || installation.pending" :aria-label="`${resource.is_installed ? (installation.enabled ? '停用' : '启用') : '安装'}${resource.display_name}`" @click="toggle">{{ resource.is_installed ? (installation.enabled ? '✓' : '启用') : '+' }}</button>
      </span>
    </div>
    <div class="sm-card-stats"><span>{{ resource.version_label || resource.resource_version }}</span><span>{{ kind === 'tools' ? (resource.is_system_default ? '系统默认工具' : '专家工具') : resource.owner_type === 'system' ? '系统资源' : '个人资源' }}</span><button v-if="resource.is_editable && kind !== 'tools'" class="edit" @click="$emit('edit')">编辑</button></div>
    <div v-if="error" class="error" role="alert">{{ error }}</div>
  </article>
</template>
<style scoped src="../../styles/components/resource-card.css"></style>
