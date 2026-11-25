<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useIdentity } from "../composables/useIdentity";
import { useSkillImports } from "../composables/useSkillImports";
import { manager } from "../api/manager";
import { useCatalogScroll } from "../composables/useCatalogScroll";
import CatalogHeader from "../components/catalog/CatalogHeader.vue";
import CatalogLoadMore from "../components/catalog/CatalogLoadMore.vue";
import AsyncState from "../components/common/AsyncState.vue";
import ResourceCategoryTabs from "../components/catalog/ResourceCategoryTabs.vue";
import ResourceCard from "../components/catalog/ResourceCard.vue";
import ResourceDetailDrawer from "../components/catalog/ResourceDetailDrawer.vue";
import BatchSkillShareDialog from "../components/skills/BatchSkillShareDialog.vue";
import SkillImportList from "../components/skills/SkillImportList.vue";
import type { Resource } from "../types/api";
const router = useRouter();
const mine = ref(false);
const search = ref("");
const category = ref("全部");
const detail = ref<Resource | null>(null);
const batchShareOpen = ref(false);
const {
  scrollRoot, items: resources, categories, hasShareable, loading, error,
  hasMore, loadingMore, moreError, onScroll, onWheel, loadMore, refresh, retry,
} = useCatalogScroll(
  (query, signal) => manager.resourceCatalog("skills", query, signal),
  (resource) => `${resource.resource_id}-${resource.resource_version}`,
  { search, category, mine },
);
const { user } = useIdentity();
const imports = useSkillImports(refresh, computed(() => user.value?.user_id));
function openBatchShare() {
  batchShareOpen.value = true;
}
function onBatchShareChanged() {
  void refresh();
}
function edit(r: Resource) {
  detail.value = null;
  void router.push({
    path: `/skills/${encodeURIComponent(r.resource_id)}/edit`,
    query: { version: r.resource_version },
  });
}
</script>
<template>
  <section class="page">
    <CatalogHeader
      page="skills"
      v-model:query="search"
      :selected="mine"
      @toggle="mine = !mine"
      @upload="router.push('/skills/upload')"
      @create="router.push('/skills/new')"
    />
    <div ref="scrollRoot" class="catalog-content skill-market"
      @scroll.passive="onScroll"
      @wheel.passive="onWheel"
    >
      <SkillImportList
        :jobs="imports.jobs.value"
        :success="imports.success.value"
        :error="imports.error.value"
        :loading="imports.loading.value"
        :retrying="imports.retrying.value"
        @refresh="imports.refresh"
        @retry="imports.retry"
        @dismiss="imports.dismiss"
      />
      <div class="sm-segment-bar">
        <span class="sm-segment-item sm-segment-item--active">推荐</span>
        <t-button
          v-if="hasShareable"
          class="batch-share-action"
          variant="outline"
          size="small"
          @click="openBatchShare"
          >批量申请共享</t-button
        >
      </div>
      <ResourceCategoryTabs v-model="category" :categories="categories" />
      <AsyncState
        :loading="loading"
        :error="error"
        :empty="!resources.length"
        empty-title="还没有可用的技能"
        empty-text="创建你的工作方法，或联系管理员获取使用授权。"
        @retry="retry"
        ><div class="card-grid">
          <ResourceCard
            v-for="resource in resources"
            :key="`${resource.resource_id}-${resource.resource_version}`"
            :resource="resource"
            kind="skills"
            @detail="detail = resource"
            @edit="edit(resource)"
            @changed="refresh"
          /></div
      ></AsyncState>
      <CatalogLoadMore
        :has-more="hasMore"
        :loading="loadingMore"
        :error="moreError"
        @load-more="loadMore"
        @retry="retry"
      />
    </div>
    <ResourceDetailDrawer
      kind="skills"
      :resource="detail"
      :resources="resources"
      @close="detail = null"
      @edit="edit"
      @changed="refresh"
    />
    <BatchSkillShareDialog
      :visible="batchShareOpen"
      title="批量申请共享"
      submit-label="提交共享申请"
      :submit-batch="manager.shareSkills"
      @close="batchShareOpen = false"
      @changed="onBatchShareChanged"
    />
  </section>
</template>

<style scoped src="../styles/components/catalog-page.css"></style>
<style scoped>
.batch-share-action {
  margin-inline-start: auto;
}
</style>
