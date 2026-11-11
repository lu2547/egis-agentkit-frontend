<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { manager } from "../api/manager";
import { useAsyncData } from "../composables/useAsyncData";
import AsyncState from "../components/common/AsyncState.vue";
import CatalogHeader from "../components/catalog/CatalogHeader.vue";
import ResourceCategoryTabs from "../components/catalog/ResourceCategoryTabs.vue";
import ResourceCard from "../components/catalog/ResourceCard.vue";
import ResourceDetailDrawer from "../components/catalog/ResourceDetailDrawer.vue";
import type { Resource } from "../types/api";

const { data, loading, error, load } = useAsyncData(() =>
  manager.resources("tools"),
);
const search = ref("");
const category = ref("全部");
const categories = ["系统默认", "专家工具"];
const detail = ref<Resource | null>(null);
const tools = computed(() =>
  (data.value?.items || []).filter((tool) => tool.is_system_default || tool.is_agent_tool),
);
const visibleTools = computed(() => {
  const query = search.value.trim().toLowerCase();
  return tools.value.filter(
    (tool) =>
      (category.value === "全部" ||
        category.value === (tool.is_system_default ? "系统默认" : "专家工具")) &&
      `${tool.display_name} ${tool.description}`.toLowerCase().includes(query),
  );
});
onMounted(load);
</script>

<template>
  <section class="page">
    <CatalogHeader
      page="tools"
      v-model:query="search"
    />
    <div class="catalog-content">
      <div class="catalog-toolbar"></div>
      <ResourceCategoryTabs v-model="category" :categories="categories" />
      <AsyncState
        :loading="loading"
        :error="error"
        :empty="!visibleTools.length"
        :empty-title="search || category !== '全部' ? '没有匹配的工具' : '还没有可用的工具'"
        @retry="load"
      >
        <div class="card-grid">
          <ResourceCard
            v-for="tool in visibleTools"
            :key="`${tool.resource_id}-${tool.resource_version}`"
            :resource="tool"
            kind="tools"
            @detail="detail = tool"
          />
        </div>
      </AsyncState>
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
