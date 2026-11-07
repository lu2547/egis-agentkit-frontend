<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import type { Resource } from "../../types/api";
import CatalogAvatar from "../common/CatalogAvatar.vue";
import { ResourceInstallation } from "../../domain/resourceState";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";
const props = defineProps<{
  resource: Resource;
  kind: "skills" | "connectors";
}>();
const emit = defineEmits<{ detail: []; changed: []; edit: [] }>();
const installation = reactive(
    new ResourceInstallation(
      props.resource.is_enabled && props.resource.is_installed,
    ),
  ),
  error = ref("");
watch(
  () => props.resource.is_enabled,
  (value) => (installation.enabled = value && props.resource.is_installed),
);
async function toggle() {
  error.value = "";
  try {
    const enabled = !installation.enabled;
    await installation.change(enabled, () =>
      props.resource.is_installed
        ? manager.toggle(
            props.kind,
            props.resource.resource_id,
            props.resource.resource_version,
            enabled,
          )
        : manager.install(
            props.kind,
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
      <span class="sm-add-btn-slot"><button type="button" :class="resource.is_installed ? 'sm-card-installed-check' : 'sm-add-btn'" :disabled="!resource.is_usable || installation.pending" :aria-label="`${resource.is_installed ? (installation.enabled ? '停用' : '启用') : '安装'}${resource.display_name}`" @click="toggle">{{ resource.is_installed ? (installation.enabled ? '✓' : '启用') : '+' }}</button></span>
    </div>
    <div class="sm-card-stats"><span>{{ resource.resource_version }}</span><span>{{ resource.owner_type === 'system' ? '系统资源' : '个人资源' }}</span><button v-if="resource.is_editable" class="edit" @click="$emit('edit')">编辑</button></div>
    <div v-if="error" class="error" role="alert">{{ error }}</div>
  </article>
</template>
<style scoped src="../../styles/components/resource-card.css"></style>
