<script setup lang="ts">
import { computed, ref, watch, type CSSProperties } from "vue";
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
import { useIdentity } from "../composables/useIdentity";
import { useWorkbenchLayout } from "../composables/useWorkbenchLayout";
import UserManagementTable from "../components/admin/UserManagementTable.vue";
import GroupManagementTable from "../components/admin/GroupManagementTable.vue";
import GrantManagementTable from "../components/admin/GrantManagementTable.vue";
import RemoteExpertManagement from "../components/admin/RemoteExpertManagement.vue";
import ShareReviewManagement from "../components/admin/ShareReviewManagement.vue";
import ResourceManagementTable from "../components/admin/ResourceManagementTable.vue";
import ConnectorManagement from "../components/admin/ConnectorManagement.vue";
import ReplyFeedbackManagement from "../components/admin/ReplyFeedbackManagement.vue";
import IconButton from "../components/common/IconButton.vue";
const route = useRoute(),
  router = useRouter(),
  { isAdmin } = useIdentity();
const section = computed(() => String(route.params.section));
const content = ref<HTMLElement>();
const navigation = ref<HTMLElement>();
const indicatorStyle = ref<CSSProperties>();
const { isMobile, toggleSidebar } = useWorkbenchLayout();
watch(section, () => content.value?.scrollTo({ top: 0 }));
watch(
  [navigation, section],
  ([nav], _, onCleanup) => {
    const link = nav?.querySelector<HTMLElement>('a[aria-current="page"]');
    if (!nav || !link) {
      indicatorStyle.value = undefined;
      return;
    }

    const updateIndicator = () => {
      indicatorStyle.value = {
        width: `${link.offsetWidth}px`,
        height: `${link.offsetHeight}px`,
        transform: `translate(${link.offsetLeft}px, ${link.offsetTop}px)`,
      };
    };

    updateIndicator();
    const observer = new ResizeObserver(updateIndicator);
    observer.observe(nav);
    observer.observe(link);
    onCleanup(() => observer.disconnect());
  },
  { flush: "post" },
);
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
        <nav ref="navigation" class="admin-navigation" aria-label="管理功能">
          <span
            v-if="indicatorStyle"
            class="admin-navigation-indicator"
            :style="indicatorStyle"
            aria-hidden="true"
          ></span>
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
        <div :key="section" class="admin-content-inner">
          <ReplyFeedbackManagement v-if="section === 'reply-feedback'" />
          <UserManagementTable v-else-if="section === 'users'" />
          <GroupManagementTable v-else-if="section === 'groups'" />
          <GrantManagementTable v-else-if="section === 'grants'" />
          <RemoteExpertManagement v-else-if="section === 'remote-agents'" />
          <ResourceManagementTable v-else-if="section === 'skills'" />
          <ConnectorManagement v-else-if="section === 'connectors'" />
          <ShareReviewManagement v-else-if="section === 'share-reviews'" />
          <div v-else class="empty">请选择管理项目。</div>
        </div>
      </section>
    </div>
  </section>
</template>
<style scoped src="../styles/components/AdminView.css"></style>
