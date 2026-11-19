<script setup lang="ts">
import { ref, computed, onScopeDispose, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { manager } from "../api/manager";
import { errorText } from "../api/http";
import { useCatalogScroll } from "../composables/useCatalogScroll";
import AsyncState from "../components/common/AsyncState.vue";
import ShareRequestDialog from "../components/catalog/ShareRequestDialog.vue";
import CatalogHeader from "../components/catalog/CatalogHeader.vue";
import CatalogLoadMore from "../components/catalog/CatalogLoadMore.vue";
import ResourceCategoryTabs from "../components/catalog/ResourceCategoryTabs.vue";
import ExpertCard from "../components/experts/ExpertCard.vue";
import ExpertDetailDialog from "../components/experts/ExpertDetailDialog.vue";
import PreferencesView from "./PreferencesView.vue";
import type { Definition } from "../types/api";
import { definitionName } from "../types/api";
const router = useRouter(), route = useRoute();
const kind = computed(() => route.query.tab === "personal" ? "personal" : "agent");
const mine = ref(false),
  search = ref(""),
  category = ref("全部"),
  detail = ref<Definition | null>(null),
  detailPending = ref(false),
  detailError = ref(""),
  notice = ref(""),
  shareSource = ref<Definition | null>(null),
  shareUpdate = ref(false);
const candidatePending = ref(new Set<string>());
const candidateError = ref("");
const enabled = computed(() => kind.value === "agent");
watch(kind, () => {
  category.value = "全部";
  mine.value = false;
  closeDetail();
  shareSource.value = null;
});
const {
  scrollRoot, items: experts, categories, loading, error, hasMore,
  loadingMore, moreError, onScroll, onWheel, loadMore, refresh, retry,
} = useCatalogScroll(
  manager.expertCatalog,
  (expert) => `${expert.id}-${expert.resource_view_type}-${expert.resource_version}`,
  { search, category, mine, enabled },
);
function candidateKey(expert: Definition) {
  return `${expert.id}:${expert.resource_view_type}`;
}
async function toggleCandidate(expert: Definition) {
  const key = candidateKey(expert);
  if (candidatePending.value.has(key)) return;
  candidatePending.value.add(key);
  candidateError.value = "";
  const selected = !expert.is_invite_candidate;
  try {
    await manager.setExpertCandidate(expert.id, expert.resource_view_type, selected);
    experts.value = experts.value.map((item) =>
      candidateKey(item) === key ? { ...item, is_invite_candidate: selected } : item,
    );
  } catch (cause) {
    candidateError.value = errorText(cause);
  } finally {
    candidatePending.value.delete(key);
  }
}
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
      "agents",
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
    path: `/experts/${encodeURIComponent(d.id)}/edit`,
    query: {
      returnTo: route.fullPath,
      view: d.owner_type === "system" ? "system" : "private",
    },
  });
}
</script>
<template>
  <section class="page expert-page">
    <CatalogHeader :page="kind" v-model:query="search" :selected="mine" @toggle="mine = !mine" @create="router.push({ path: '/experts/new', query: { returnTo: route.fullPath } })" />
    <PreferencesView v-if="kind === 'personal'" embedded />
    <div v-else ref="scrollRoot" class="catalog-content"
      @scroll.passive="onScroll"
      @wheel.passive="onWheel"
    >
    <div class="catalog-toolbar"></div>
    <ResourceCategoryTabs v-model="category" :categories="categories" />
    <div v-if="candidateError" class="error" role="alert">{{ candidateError }}</div>
    <div v-if="notice" class="notice" role="status">
      {{ notice
      }}<button class="plain" aria-label="关闭提示" @click="notice = ''">
        ×
      </button>
    </div>
    <AsyncState
      :loading="loading"
      :error="error"
      :empty="!experts.length"
      empty-title="还没有匹配的工作伙伴"
      empty-text="试试其他分类，或创建你自己的专家。"
      @retry="retry"
      ><div class="card-grid">
        <ExpertCard
          v-for="definition in experts"
          :key="`${definition.id}-${definition.resource_view_type}-${definition.resource_version}`"
          :definition="definition"
          :candidate-pending="candidatePending.has(candidateKey(definition))"
          @detail="openDetail(definition)"
          @summon="summon(definition)"
          @edit="edit(definition)"
          @toggle-candidate="toggleCandidate(definition)"
        /></div></AsyncState
    >
    <CatalogLoadMore
      :has-more="hasMore"
      :loading="loadingMore"
      :error="moreError"
      @load-more="loadMore"
      @retry="retry"
    />
    <ExpertDetailDialog
      :definition="detail"
      :definitions="experts"
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
      @submitted="shareSource = null; notice = '共享申请已提交。'; refresh()"
    />
    </div>
  </section>
</template>
<style scoped src="../styles/components/catalog-page.css"></style>
