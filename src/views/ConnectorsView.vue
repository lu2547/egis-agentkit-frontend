<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { errorText } from "../api/http";
import { manager } from "../api/manager";
import { useAsyncData } from "../composables/useAsyncData";
import { takeConnectorOAuthRequest } from "../domain/connectorAuthorization";
import CatalogHeader from "../components/catalog/CatalogHeader.vue";
import AsyncState from "../components/common/AsyncState.vue";
import ResourceCard from "../components/catalog/ResourceCard.vue";
import ResourceDetailDrawer from "../components/catalog/ResourceDetailDrawer.vue";
import type { Resource } from "../types/api";

const { data, loading, error, load } = useAsyncData(() =>
  manager.resources("connectors"),
);
const search = ref("");
const detail = ref<Resource | null>(null);
const resources = computed(() =>
  (data.value?.items || []).filter((resource) =>
    `${resource.display_name} ${resource.description}`
      .toLowerCase()
      .includes(search.value.toLowerCase()),
  ),
);
const route = useRoute();
const router = useRouter();
const oauthNotice = ref("");

onMounted(async () => {
  const { state, code } = route.query;
  if (typeof state === "string") {
    await router.replace({ path: "/connectors" });
    try {
      const resourceId = takeConnectorOAuthRequest(state);
      if (!resourceId) throw new Error("当前浏览器没有对应的连接器授权请求。");
      await manager.finishConnectorOAuth(
        resourceId, state, typeof code === "string" ? code : null,
      );
      oauthNotice.value = "连接器已授权，可以添加。";
    } catch (err) {
      oauthNotice.value = errorText(err);
    }
  }
  await load();
});
</script>

<template>
  <section class="page">
    <CatalogHeader
      page="connectors"
      v-model:query="search"
    />
    <div class="catalog-content">
      <div class="catalog-toolbar"></div>
      <p v-if="oauthNotice" role="status">{{ oauthNotice }}</p>
      <AsyncState
        :loading="loading"
        :error="error"
        :empty="!resources.length"
        empty-title="暂无可用连接器"
        empty-text="如需使用其他连接器，请联系管理员。"
        @retry="load"
      >
        <div class="card-grid">
          <ResourceCard
            v-for="resource in resources"
            :key="resource.resource_id"
            :resource="resource"
            kind="connectors"
            @detail="detail = resource"
            @changed="load"
          />
        </div>
      </AsyncState>
    </div>
    <ResourceDetailDrawer
      kind="connectors"
      :resource="detail"
      :resources="data?.items || []"
      @close="detail = null"
      @changed="load"
    />
  </section>
</template>

<style scoped src="../styles/components/catalog-page.css"></style>
