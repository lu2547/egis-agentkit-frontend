<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useSkillImports } from "../composables/useSkillImports";
import { manager } from "../api/manager";
import { useAsyncData } from "../composables/useAsyncData";
import CatalogHeader from "../components/catalog/CatalogHeader.vue";
import AsyncState from "../components/common/AsyncState.vue";
import ResourceCategoryTabs from "../components/catalog/ResourceCategoryTabs.vue";
import ResourceCard from "../components/catalog/ResourceCard.vue";
import ResourceDetailDrawer from "../components/catalog/ResourceDetailDrawer.vue";
import BatchSkillShareDialog from "../components/skills/BatchSkillShareDialog.vue";
import SkillImportList from "../components/skills/SkillImportList.vue";
import type { Resource } from "../types/api";
const { data, loading, error, load } = useAsyncData(() =>
  manager.resources("skills"),
);
const router = useRouter();
const imports = useSkillImports(load);
const batchShareOpen = ref(false);
const shareableSkills = computed(() =>
  (data.value?.items || []).filter((resource) => resource.can_share),
);
const filter = ref("all"),
  search = ref(""),
  category = ref("全部"),
  detail = ref<Resource | null>(null);
const categories = computed(() => [
  ...new Set(
    (data.value?.items || [])
      .map((r) => String(r.payload.category || ""))
      .filter(Boolean),
  ),
]);
const resources = computed(() =>
  (data.value?.items || []).filter(
    (r) =>
      (filter.value !== "mine" || r.is_installed) &&
      (category.value === "全部" || r.payload.category === category.value) &&
      `${r.display_name} ${r.description}`
        .toLowerCase()
        .includes(search.value.toLowerCase()),
  ),
);
onMounted(load);
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
      :selected="filter === 'mine'"
      @toggle="filter = filter === 'mine' ? 'all' : 'mine'"
      @upload="router.push('/skills/upload')"
      @create="router.push('/skills/new')"
    />
    <div class="catalog-content skill-market">
      <SkillImportList
        :jobs="imports.jobs.value"
        :error="imports.error.value"
        :loading="imports.loading.value"
        :retrying="imports.retrying.value"
        @refresh="imports.refresh"
        @retry="imports.retry"
      />
      <div class="sm-segment-bar">
        <span class="sm-segment-item sm-segment-item--active">推荐</span>
        <t-button
          v-if="shareableSkills.length"
          class="batch-share-action"
          variant="outline"
          size="small"
          @click="batchShareOpen = true"
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
        @retry="load"
        ><div class="card-grid">
          <ResourceCard
            v-for="resource in resources"
            :key="`${resource.resource_id}-${resource.resource_version}`"
            :resource="resource"
            kind="skills"
            @detail="detail = resource"
            @edit="edit(resource)"
            @changed="load"
          /></div
      ></AsyncState>
    </div>
    <ResourceDetailDrawer
      kind="skills"
      :resource="detail"
      :resources="data?.items || []"
      @close="detail = null"
      @edit="edit"
    />
    <BatchSkillShareDialog
      :visible="batchShareOpen"
      title="批量申请共享"
      submit-label="提交共享申请"
      :resources="shareableSkills"
      :submit-batch="manager.shareSkills"
      @close="batchShareOpen = false"
      @changed="load"
    />
  </section>
</template>

<style scoped src="../styles/components/catalog-page.css"></style>
<style scoped>
.batch-share-action {
  margin-inline-start: auto;
}
</style>
