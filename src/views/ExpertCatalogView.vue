<script setup lang="ts">
import { ref, computed, onMounted, onScopeDispose, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { manager } from "../api/manager";
import { errorText } from "../api/http";
import { useIdentity } from "../composables/useIdentity";
import { useAsyncData } from "../composables/useAsyncData";
import AsyncState from "../components/common/AsyncState.vue";
import ShareRequestDialog from "../components/catalog/ShareRequestDialog.vue";
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
  detailPending = ref(false),
  detailError = ref(""),
  notice = ref(""),
  shareSource = ref<Definition | null>(null),
  shareUpdate = ref(false);
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
  closeDetail();
  shareSource.value = null;
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
      version: d.resource_version,
      kind: d.definition_type,
      ...(prompt ? { prompt } : {}),
    },
  });
}
let detailRequest: AbortController | undefined;
function closeDetail() {
  detailRequest?.abort();
  detail.value = null;
  detailPending.value = false;
}
onScopeDispose(closeDetail);

/** 打开详情时重新读取该用户当前可见的定义。 */
async function openDetail(d: Definition) {
  closeDetail();
  detail.value = d;
  detailRequest?.abort();
  detailRequest = new AbortController();
  const { signal } = detailRequest;
  detailPending.value = true;
  detailError.value = "";
  try {
    const selected = await manager.definition(
      d.definition_type === "team" ? "teams" : "agents",
      d.id, d.resource_view_type, undefined, signal,
    );
    if (!signal.aborted) detail.value = selected;
  } catch (error) {
    if (!signal.aborted) detailError.value = errorText(error);
  } finally {
    if (!signal.aborted) detailPending.value = false;
  }
}
function edit(d: Definition) {
  router.push({
    path: `/${d.definition_type === "team" ? "teams" : "experts"}/${encodeURIComponent(d.id)}/edit`,
    query: {
      returnTo: route.fullPath,
      view: d.owner_type === "system" ? "system" : "private",
    },
  });
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
          :key="`${definition.id}-${definition.resource_view_type}-${definition.resource_version}`"
          :definition="definition"
          @detail="openDetail(definition)"
          @summon="summon(definition)"
          @edit="edit(definition)"
        /></div></AsyncState
    ><ExpertDetailDialog
      :definition="detail"
      :definitions="data || []"
      :pending="detailPending"
      :error="detailError"
      @close="closeDetail"
      @summon="detail && summon(detail, $event)"
      @edit="detail && edit(detail)"
      @share="shareUpdate = $event; shareSource = detail; closeDetail()"
    />
    <ShareRequestDialog
      :visible="!!shareSource"
      :resource-type="shareSource?.definition_type"
      :resource-id="shareSource?.id || ''"
      :version="shareSource?.version_label || shareSource?.resource_version || ''"
      :update="shareUpdate"
      @close="shareSource && openDetail(shareSource); shareSource = null"
      @submitted="shareSource = null; notice = '共享申请已提交。'; load()"
    />
    </div>
  </section>
</template>
<style scoped src="../styles/components/catalog-page.css"></style>
