<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { errorText } from "../api/http";
import { manager } from "../api/manager";
import { useCatalogScroll } from "../composables/useCatalogScroll";
import {
  notifyConnectorOAuthResult,
  takeConnectorOAuthRequest,
  watchConnectorOAuthResult,
} from "../domain/connectorAuthorization";
import CatalogHeader from "../components/catalog/CatalogHeader.vue";
import CatalogLoadMore from "../components/catalog/CatalogLoadMore.vue";
import AsyncState from "../components/common/AsyncState.vue";
import ResourceCard from "../components/catalog/ResourceCard.vue";
import ResourceDetailDrawer from "../components/catalog/ResourceDetailDrawer.vue";

const route = useRoute();
const router = useRouter();
const enabled = ref(typeof route.query.state !== "string");
const search = ref("");
const detailId = ref<string | null>(null);
const {
  scrollRoot, items: resources, loading, error, hasMore, loadingMore, moreError,
  onScroll, onWheel, loadMore, refresh, retry,
} = useCatalogScroll(
  (query, signal) => manager.resourceCatalog("connectors", query, signal),
  (resource) => resource.resource_id,
  { search, enabled },
);
const detail = computed(
  () => resources.value.find((resource) => resource.resource_id === detailId.value) ?? null,
);
const oauthNotice = ref("");
let stopWatchingOAuth: (() => void) | undefined;

onMounted(async () => {
  const { state, code } = route.query;
  if (typeof state !== "string") {
    stopWatchingOAuth = watchConnectorOAuthResult((message) => {
      oauthNotice.value = message;
      void refresh();
    });
  } else {
    await router.replace({ path: "/connectors" });
    const pending = takeConnectorOAuthRequest(state);
    let succeeded = false;
    try {
      if (!pending) throw new Error("当前浏览器没有对应的连接器授权请求。");
      await manager.finishConnectorOAuth(
        pending.resourceId,
        state,
        typeof code === "string" ? code : null,
      );
      succeeded = true;
      oauthNotice.value = "连接器已授权，可以添加。";
    } catch (err) {
      oauthNotice.value = errorText(err);
    }
    if (pending?.authorizationTab) {
      notifyConnectorOAuthResult(state, oauthNotice.value);
      if (succeeded) window.close();
    }
    enabled.value = true;
  }
});
onUnmounted(() => stopWatchingOAuth?.());
</script>

<template>
  <section class="page">
    <CatalogHeader
      page="connectors"
      v-model:query="search"
    />
    <div ref="scrollRoot" class="catalog-content"
      @scroll.passive="onScroll"
      @wheel.passive="onWheel"
    >
      <div class="catalog-toolbar"></div>
      <p v-if="oauthNotice" role="status">{{ oauthNotice }}</p>
      <AsyncState
        :loading="loading"
        :error="error"
        :empty="!resources.length"
        empty-title="暂无可用连接器"
        empty-text="如需使用其他连接器，请联系管理员。"
        @retry="retry"
      >
        <div class="card-grid">
          <ResourceCard
            v-for="resource in resources"
            :key="resource.resource_id"
            :resource="resource"
            kind="connectors"
            @detail="detailId = resource.resource_id"
            @changed="refresh"
          />
        </div>
      </AsyncState>
      <CatalogLoadMore
        :has-more="hasMore"
        :loading="loadingMore"
        :error="moreError"
        @load-more="loadMore"
        @retry="retry"
      />
    </div>
    <ResourceDetailDrawer
      kind="connectors"
      :resource="detail"
      :resources="resources"
      @close="detailId = null"
      @changed="refresh"
    />
  </section>
</template>

<style scoped src="../styles/components/catalog-page.css"></style>
