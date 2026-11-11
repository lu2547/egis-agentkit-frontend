<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { errorText } from "../api/http";
import { manager } from "../api/manager";
import { useAsyncData } from "../composables/useAsyncData";
import CatalogHeader from "../components/catalog/CatalogHeader.vue";
import AsyncState from "../components/common/AsyncState.vue";
import ResourceCard from "../components/catalog/ResourceCard.vue";
import ResourceDetailDrawer from "../components/catalog/ResourceDetailDrawer.vue";
import ConnectorConfigDialog from "../components/connectors/ConnectorConfigDialog.vue";
import ConnectorAuthorization from "../components/connectors/ConnectorAuthorization.vue";
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
const route = useRoute();
const router = useRouter();
const oauthNotice = ref("");
onMounted(async () => {
  const state = route.query.state;
  if (typeof state === "string") {
    const code = typeof route.query.code === "string" ? route.query.code : null;
    const key = `egis-mcp-oauth:${state}`;
    const pending = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
    await router.replace({ path: "/connectors" });
    if (pending) {
      try {
        const { resourceId, version } = JSON.parse(pending);
        await manager.finishConnectorOAuth(resourceId, version, state, code);
        oauthNotice.value = "连接器已授权。";
      } catch (err) {
        oauthNotice.value = errorText(err);
      }
    } else oauthNotice.value = "当前浏览器没有对应的连接器授权请求。";
  }
  await load();
});
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
    <p v-if="oauthNotice" role="status">{{ oauthNotice }}</p>
    <section
      v-if="data?.dependency_authorizations?.length"
      class="form-stack"
      aria-label="专家连接授权"
    >
      <h2>专家连接授权</h2>
      <details v-for="connector in data.dependency_authorizations" :key="`${connector.resource_id}:${connector.resource_version}`">
        <summary>{{ connector.display_name }} · {{ connector.resource_version }}</summary>
        <ConnectorAuthorization
          :resource-id="connector.resource_id"
          :version="connector.resource_version"
          :method="connector.auth_type"
        />
      </details>
    </section>
    <AsyncState
      :loading="loading"
      :error="error"
      :empty="!resources.length"
      :empty-title="data?.dependency_authorizations?.length ? '还没有可安装到个人助理的连接器' : '还没有可用的连接器'"
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
