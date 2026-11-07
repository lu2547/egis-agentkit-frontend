<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { manager } from "../api/manager";
import { errorText } from "../api/http";
import { useIdentity } from "../composables/useIdentity";
import { useAsyncData } from "../composables/useAsyncData";
import AsyncState from "../components/common/AsyncState.vue";
import CatalogHeader from "../components/catalog/CatalogHeader.vue";
import ResourceCategoryTabs from "../components/catalog/ResourceCategoryTabs.vue";
import ExpertCard from "../components/experts/ExpertCard.vue";
import ExpertDetailDialog from "../components/experts/ExpertDetailDialog.vue";
import PreferencesView from "./PreferencesView.vue";
import type { Definition } from "../types/api";
import { definitionName } from "../types/api";
const router = useRouter(), route = useRoute(),
  { user } = useIdentity();
const kind = ref<"agent" | "team" | "personal">(route.query.tab === "personal" ? "personal" : route.query.tab === "team" ? "team" : "agent"),
  mine = ref("all"),
  search = ref(""),
  category = ref("全部"),
  detail = ref<Definition | null>(null),
  notice = ref("");
const { data, loading, error, load } = useAsyncData(async () => {
  const [agents, teams] = await Promise.all([
    manager.definitions("agents"),
    manager.definitions("teams"),
  ]);
  return [...agents.items, ...teams.items];
});
onMounted(load);
watch(() => route.query.tab, value => {
  kind.value = value === "personal" ? "personal" : value === "team" ? "team" : "agent";
  category.value = "全部";
  mine.value = "all";
  detail.value = null;
});
const current = computed(() =>
  (data.value || []).filter((d) => d.definition_type === kind.value && d.agent_type !== "personal"),
);
const categories = computed(() => [
  ...new Set(current.value.map((d) => d.payload.category).filter(Boolean)),
]);
const filtered = computed(() =>
  current.value.filter(
    (d) =>
      (mine.value !== "mine" ||
        (d.owner_type === "user" && d.owner_id === user.value?.user_id)) &&
      (category.value === "全部" || d.payload.category === category.value) &&
      `${definitionName(d)} ${d.payload.description} ${d.payload.tags?.join(" ")}`
        .toLowerCase()
        .includes(search.value.toLowerCase()),
  ),
);
function summon(d: Definition, prompt?: string) {
  if (!d.is_usable) return;
  router.push({
    path: "/",
    query: {
      definition: d.id,
      view: d.resource_view_type,
      ...(prompt ? { prompt } : {}),
    },
  });
}
function edit(d: Definition) {
  router.push({
    path: `/${d.definition_type === "team" ? "teams" : "experts"}/${encodeURIComponent(d.id)}/edit`,
    query: { returnTo: route.fullPath },
  });
}
async function share() {
  if (!detail.value) return;
  try {
    await manager.share(detail.value.definition_type, detail.value.id);
    notice.value = "共享申请已提交，审核通过后面向所有用户。";
  } catch (e) {
    notice.value = errorText(e);
  }
}
</script>
<template>
  <section class="page expert-page">
    <CatalogHeader :page="kind" v-model:query="search" :selected="mine === 'mine'" @toggle="mine = mine === 'mine' ? 'all' : 'mine'" @create="router.push({ path: kind === 'team' ? '/teams/new' : '/experts/new', query: { returnTo: route.fullPath } })" />
    <PreferencesView v-if="kind === 'personal'" embedded />
    <div v-else class="catalog-content">
    <div class="catalog-toolbar"></div>
    <ResourceCategoryTabs v-model="category" :categories="categories" />
    <div v-if="notice" class="notice" role="status">
      {{ notice
      }}<button class="plain" aria-label="关闭提示" @click="notice = ''">
        ×
      </button>
    </div>
    <AsyncState
      :loading="loading"
      :error="error"
      :empty="!filtered.length"
      empty-title="还没有匹配的工作伙伴"
      empty-text="试试其他分类，或创建你自己的专家。"
      @retry="load"
      ><div class="card-grid">
        <ExpertCard
          v-for="definition in filtered"
          :key="`${definition.id}-${definition.resource_view_type}`"
          :definition="definition"
          @detail="detail = definition"
          @summon="summon(definition)"
          @edit="edit(definition)"
        /></div></AsyncState
    ><ExpertDetailDialog
      :definition="detail"
      :definitions="data || []"
      @close="detail = null"
      @summon="detail && summon(detail, $event)"
      @edit="detail && edit(detail)"
      @share="share"
    />
    </div>
  </section>
</template>
<style scoped src="../styles/components/catalog-page.css"></style>
