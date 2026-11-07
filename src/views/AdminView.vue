<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import { useRoute } from "vue-router";
import { manager } from "../api/manager";
import { useIdentity } from "../composables/useIdentity";
import { useAsyncData } from "../composables/useAsyncData";
import type { Review } from "../types/api";
import UserManagementTable from "../components/admin/UserManagementTable.vue";
import GroupManagementTable from "../components/admin/GroupManagementTable.vue";
import GrantManagementTable from "../components/admin/GrantManagementTable.vue";
import ShareReviewList from "../components/catalog/ShareReviewList.vue";
import PackageReleaseList from "../components/packages/PackageReleaseList.vue";
import AsyncState from "../components/common/AsyncState.vue";
const route = useRoute(),
  { user } = useIdentity();
const section = computed(() => String(route.params.section));
const tabs = [
  { key: "users", label: "用户" },
  { key: "groups", label: "用户组" },
  { key: "grants", label: "使用授权" },
  { key: "share-reviews", label: "共享审核" },
  { key: "packages", label: "发布包" },
];
const { data, loading, error, load } = useAsyncData(() =>
  manager.adminList<Review>("share-reviews"),
);
watch(
  section,
  (value) => {
    if (value === "share-reviews" && user.value?.role_type === "admin")
      void load();
  },
  { immediate: true },
);
</script>
<template>
  <section class="page">
    <div v-if="user?.role_type !== 'admin'" class="empty">
      <h3>此页面仅管理员可访问</h3>
      <p>如需使用资源，请联系管理员获取授权。</p>
    </div>
    <template v-else
      ><header class="page-title">
        <div>
          <h1>管理控制台</h1>
          <p>管理企业成员、资源使用权限与共享发布。</p>
        </div>
      </header>
      <nav class="admin-tabs">
        <RouterLink
          v-for="tab in tabs"
          :key="tab.key"
          :to="`/admin/${tab.key}`"
          :class="{ active: section === tab.key }"
          >{{ tab.label }}</RouterLink
        >
      </nav>
      <UserManagementTable v-if="section === 'users'" /><GroupManagementTable
        v-else-if="section === 'groups'"
      /><GrantManagementTable
        v-else-if="section === 'grants'"
      /><PackageReleaseList v-else-if="section === 'packages'" /><AsyncState
        v-else-if="section === 'share-reviews'"
        :loading="loading"
        :error="error"
        :empty="!data?.items.length"
        empty-title="暂无共享审核"
        @retry="load"
        ><ShareReviewList :reviews="data?.items || []" admin @changed="load"
      /></AsyncState>
      <div v-else class="empty">请选择管理项目。</div></template
    >
  </section>
</template>
<style scoped src="../styles/components/AdminView.css"></style>
