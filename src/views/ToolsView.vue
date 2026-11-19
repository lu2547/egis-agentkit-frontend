<script setup lang="ts">
import { ref } from "vue";
import { manager } from "../api/manager";
import { useCatalogScroll } from "../composables/useCatalogScroll";
import AsyncState from "../components/common/AsyncState.vue";
import CatalogHeader from "../components/catalog/CatalogHeader.vue";
import CatalogLoadMore from "../components/catalog/CatalogLoadMore.vue";
import ResourceCategoryTabs from "../components/catalog/ResourceCategoryTabs.vue";
import ResourceCard from "../components/catalog/ResourceCard.vue";
import ResourceDetailDrawer from "../components/catalog/ResourceDetailDrawer.vue";
import type { Resource } from "../types/api";

const search = ref("");
const category = ref("全部");
const categories = ["系统默认", "专家工具"];
const detail = ref<Resource | null>(null);
const {
  scrollRoot, items: tools, loading, error, hasMore, loadingMore, moreError,
  onScroll, onWheel, loadMore, retry,
} = useCatalogScroll(
  (query, signal) => manager.resourceCatalog("tools", query, signal),
  (tool) => `${tool.resource_id}-${tool.resource_version}`,
  { search, category },
);
</script>

<template>
  <section class="page">
    <CatalogHeader
      page="tools"
      v-model:query="search"
    />
    <div ref="scrollRoot" class="catalog-content"
      @scroll.passive="onScroll"
      @wheel.passive="onWheel"
    >
      <div class="catalog-toolbar"></div>
      <ResourceCategoryTabs v-model="category" :categories="categories" />
      <AsyncState
        :loading="loading"
        :error="error"
        :empty="!tools.length"
        :empty-title="search || category !== '全部' ? '没有匹配的工具' : '还没有可用的工具'"
        @retry="retry"
      >
        <div class="card-grid">
          <ResourceCard
            v-for="tool in tools"
            :key="`${tool.resource_id}-${tool.resource_version}`"
            :resource="tool"
            kind="tools"
            @detail="detail = tool"
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
      kind="tools"
      :resource="detail"
      :resources="tools"
      @close="detail = null"
    />
  </section>
</template>

<style scoped src="../styles/components/catalog-page.css"></style>
