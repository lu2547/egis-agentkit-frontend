<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { manager } from "../api/manager";
import { useIdentity } from "../composables/useIdentity";
import { useAsyncData } from "../composables/useAsyncData";
import type { Review } from "../types/api";
import UserManagementTable from "../components/admin/UserManagementTable.vue";
import GroupManagementTable from "../components/admin/GroupManagementTable.vue";
import GrantManagementTable from "../components/admin/GrantManagementTable.vue";
import RemoteExpertManagement from "../components/admin/RemoteExpertManagement.vue";
import ShareReviewList from "../components/catalog/ShareReviewList.vue";
import ResourceManagementTable from "../components/admin/ResourceManagementTable.vue";
import AsyncState from "../components/common/AsyncState.vue";
const route = useRoute(),
  router = useRouter(),
  { isAdmin } = useIdentity();
const section = computed(() => String(route.params.section));
watch(
  [isAdmin, () => route.name],
  ([allowed, name]) => {
    if (allowed && name === "admin-access-denied") void router.replace("/admin/users");
  },
  { immediate: true },
);
const tabs = [
  { key: "users", label: "用户" },
  { key: "groups", label: "用户组" },
  { key: "grants", label: "使用授权" },
  { key: "share-reviews", label: "共享审核" },
  { key: "skills", label: "技能" },
  { key: "connectors", label: "连接器" },
  { key: "remote-agents", label: "第三方专家" },
];
const { data, loading, error, load } = useAsyncData(() =>
  manager.adminList<Review>("share-reviews"),
);
watch(
  [section, isAdmin],
  ([value, allowed]) => {
    if (value === "share-reviews" && allowed) void load();
  },
  { immediate: true },
);
</script>
<template>
  <section class="page">
    <div v-if="!isAdmin" class="empty">
      <h3>此页面仅管理员可访问</h3>
      <p>如需使用资源，请联系管理员获取授权。</p>
    </div>
    <template v-else
      ><header class="page-title">
        <div>
          <h1>管理</h1>
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
      /><RemoteExpertManagement
        v-else-if="section === 'remote-agents'"
      /><ResourceManagementTable v-else-if="section === 'skills'" kind="skill"
      /><ResourceManagementTable v-else-if="section === 'connectors'" kind="mcp"
      /><AsyncState
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
