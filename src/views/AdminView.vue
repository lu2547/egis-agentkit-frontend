<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  ClipboardCheck,
  KeyRound,
  Link2,
  MessageSquareText,
  PanelLeft,
  Plug,
  UserRound,
  UsersRound,
  WandSparkles,
} from "lucide-vue-next";
import { manager } from "../api/manager";
import { useIdentity } from "../composables/useIdentity";
import { useAsyncData } from "../composables/useAsyncData";
import { useWorkbenchLayout } from "../composables/useWorkbenchLayout";
import type { Review } from "../types/api";
import AdminSectionHeader from "../components/admin/AdminSectionHeader.vue";
import UserManagementTable from "../components/admin/UserManagementTable.vue";
import GroupManagementTable from "../components/admin/GroupManagementTable.vue";
import GrantManagementTable from "../components/admin/GrantManagementTable.vue";
import RemoteExpertManagement from "../components/admin/RemoteExpertManagement.vue";
import ShareReviewList from "../components/catalog/ShareReviewList.vue";
import ResourceManagementTable from "../components/admin/ResourceManagementTable.vue";
import ConnectorManagement from "../components/admin/ConnectorManagement.vue";
import ReplyFeedbackManagement from "../components/admin/ReplyFeedbackManagement.vue";
import AsyncState from "../components/common/AsyncState.vue";
import IconButton from "../components/common/IconButton.vue";
const route = useRoute(),
  router = useRouter(),
  { isAdmin } = useIdentity();
const section = computed(() => String(route.params.section));
const content = ref<HTMLElement>();
const { isMobile, toggleSidebar } = useWorkbenchLayout();
watch(section, () => content.value?.scrollTo({ top: 0 }));
watch(
  [isAdmin, () => route.name],
  ([allowed, name]) => {
    if (allowed && name === "admin-access-denied")
      void router.replace("/admin/users");
  },
  { immediate: true },
);
const sections = [
  [
    { key: "users", label: "用户", icon: UserRound },
    { key: "groups", label: "用户组", icon: UsersRound },
    { key: "grants", label: "使用授权", icon: KeyRound },
    { key: "share-reviews", label: "共享审核", icon: ClipboardCheck },
  ],
  [
    { key: "skills", label: "技能", icon: WandSparkles },
    { key: "connectors", label: "MCP", icon: Plug },
    { key: "remote-agents", label: "第三方专家", icon: Link2 },
  ],
  [{ key: "reply-feedback", label: "回复反馈", icon: MessageSquareText }],
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
  <section class="admin-view">
    <div v-if="!isAdmin" class="admin-denied empty">
      <h3>此页面仅管理员可访问</h3>
      <p>如需使用资源，请联系管理员获取授权。</p>
    </div>
    <div v-else class="admin-layout">
      <aside class="admin-sidebar">
        <header class="admin-sidebar-title">
          <IconButton
            v-if="isMobile"
            label="打开工作台侧栏"
            @click="toggleSidebar"
          >
            <PanelLeft :size="17" />
          </IconButton>
          <h1>管理</h1>
        </header>
        <nav class="admin-navigation" aria-label="管理功能">
          <ul v-for="group in sections" :key="group[0].key">
            <li v-for="item in group" :key="item.key">
              <RouterLink
                :to="`/admin/${item.key}`"
                :aria-current="section === item.key ? 'page' : undefined"
              >
                <component :is="item.icon" :size="17" aria-hidden="true" />
                {{ item.label }}
              </RouterLink>
            </li>
          </ul>
        </nav>
      </aside>

      <section ref="content" class="admin-content" aria-label="管理内容">
        <div class="admin-content-inner">
          <ReplyFeedbackManagement v-if="section === 'reply-feedback'" />
          <UserManagementTable v-else-if="section === 'users'" />
          <GroupManagementTable v-else-if="section === 'groups'" />
          <GrantManagementTable v-else-if="section === 'grants'" />
          <RemoteExpertManagement v-else-if="section === 'remote-agents'" />
          <ResourceManagementTable v-else-if="section === 'skills'" />
          <ConnectorManagement v-else-if="section === 'connectors'" />
          <template v-else-if="section === 'share-reviews'">
            <AdminSectionHeader title="共享审核" />
            <AsyncState
              :loading="loading && !data"
              :error="data ? '' : error"
              :empty="!data?.items.length"
              empty-title="暂无共享审核"
              @retry="load"
            >
              <div v-if="error" class="error" role="alert">
                {{ error }}
                <t-button variant="text" @click="load">重新加载</t-button>
              </div>
              <ShareReviewList
                :reviews="data?.items || []"
                admin
                @changed="load"
              />
            </AsyncState>
          </template>
          <div v-else class="empty">请选择管理项目。</div>
        </div>
      </section>
    </div>
  </section>
</template>
<style scoped src="../styles/components/AdminView.css"></style>
