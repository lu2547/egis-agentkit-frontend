<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { manager } from "../api/manager";
import { useAsyncData } from "../composables/useAsyncData";
import CatalogHeader from "../components/catalog/CatalogHeader.vue";
import AsyncState from "../components/common/AsyncState.vue";
import ResourceCard from "../components/catalog/ResourceCard.vue";
import ResourceDetailDrawer from "../components/catalog/ResourceDetailDrawer.vue";
import ConnectorConfigDialog from "../components/connectors/ConnectorConfigDialog.vue";
import type { Resource } from "../types/api";
const { data, loading, error, load } = useAsyncData(() =>
  manager.resources("connectors"),
);
const installedOnly = ref(false),
  search = ref(""),
  detail = ref<Resource | null>(null),
  editing = ref<Resource | null>(null),
  editor = ref(false);
const resources = computed(() =>
  (data.value?.items || []).filter((r) =>
    (!installedOnly.value || r.is_installed) && `${r.display_name} ${r.description}`
      .toLowerCase()
      .includes(search.value.toLowerCase()),
  ),
);
onMounted(load);
function edit(r: Resource) {
  editing.value = r;
  editor.value = true;
  detail.value = null;
}
</script>
<template>
  <section class="page">
    <CatalogHeader page="connectors" v-model:query="search" :selected="installedOnly" @toggle="installedOnly = !installedOnly" />
    <div class="catalog-content"><div class="catalog-toolbar"></div>
    <AsyncState
      :loading="loading"
      :error="error"
      :empty="!resources.length"
      empty-title="还没有可用的连接器"
      empty-text="添加 MCP 服务，或联系管理员获取使用授权。"
      @retry="load"
      ><div class="card-grid">
        <ResourceCard
          v-for="resource in resources"
          :key="`${resource.resource_id}-${resource.resource_version}`"
          :resource="resource"
          kind="connectors"
          @detail="detail = resource"
          @edit="edit(resource)"
          @changed="load"
        /></div></AsyncState
    ></div><ResourceDetailDrawer
      kind="connectors"
      :resource="detail"
      :resources="data?.items || []"
      @close="detail = null"
      @edit="edit"
    /><ConnectorConfigDialog
      :visible="editor"
      :resource="editing"
      @close="editor = false"
      @saved="load"
    />
  </section>
</template>

<style scoped src="../styles/components/catalog-page.css"></style>
