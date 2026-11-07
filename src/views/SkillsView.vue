<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { manager } from "../api/manager";
import { useAsyncData } from "../composables/useAsyncData";
import CatalogHeader from "../components/catalog/CatalogHeader.vue";
import AsyncState from "../components/common/AsyncState.vue";
import ResourceCategoryTabs from "../components/catalog/ResourceCategoryTabs.vue";
import ResourceCard from "../components/catalog/ResourceCard.vue";
import ResourceDetailDrawer from "../components/catalog/ResourceDetailDrawer.vue";
import SkillEditorDialog from "../components/skills/SkillEditorDialog.vue";
import SkillUploadDialog from "../components/skills/SkillUploadDialog.vue";
import type { Resource } from "../types/api";
const { data, loading, error, load } = useAsyncData(() =>
  manager.resources("skills"),
);
const filter = ref("all"),
  search = ref(""),
  category = ref("全部"),
  detail = ref<Resource | null>(null),
  editing = ref<Resource | null>(null),
  editor = ref(false),
  upload = ref(false);
const categories = computed(() => [...new Set((data.value?.items || []).map(r => String(r.payload.category || "")).filter(Boolean))]);
const resources = computed(() =>
  (data.value?.items || []).filter(
    (r) =>
      (filter.value === "mine"
        ? r.is_installed
        : r.is_skill_market_visible !== false) &&
      (category.value === "全部" || r.payload.category === category.value) &&
      `${r.display_name} ${r.description}`
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
    <CatalogHeader page="skills" v-model:query="search" :selected="filter === 'mine'" @toggle="filter = filter === 'mine' ? 'all' : 'mine'" @upload="upload = true" @create="editing = null; editor = true" />
    <div class="catalog-content skill-market"><div class="sm-segment-bar"><span class="sm-segment-item sm-segment-item--active">推荐</span></div><ResourceCategoryTabs v-model="category" :categories="categories" />
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
        /></div></AsyncState
    ></div><ResourceDetailDrawer
      kind="skills"
      :resource="detail"
      :resources="data?.items || []"
      @close="detail = null"
      @edit="edit"
    /><SkillEditorDialog
      :visible="editor"
      :resource="editing"
      @close="editor = false"
      @saved="load"
    /><SkillUploadDialog
      :visible="upload"
      @close="upload = false"
      @saved="load"
    />
  </section>
</template>

<style scoped src="../styles/components/catalog-page.css"></style>
