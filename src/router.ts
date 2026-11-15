import { createRouter, createWebHistory } from "vue-router";
import { useIdentity } from "./composables/useIdentity";
import WorkbenchLayout from "./layouts/WorkbenchLayout.vue";
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      component: WorkbenchLayout,
      children: [
        { path: "", component: () => import("./views/HomeView.vue") },
        {
          path: "projects/:projectId",
          component: () => import("./views/HomeView.vue"),
        },
        {
          path: "tasks/:sessionId",
          component: () => import("./views/ConversationView.vue"),
        },
        {
          path: "experts",
          component: () => import("./views/ExpertCatalogView.vue"),
        },
        {
          path: "experts/new",
          component: () => import("./views/ExpertEditView.vue"),
        },
        {
          path: "experts/:definitionId/edit",
          component: () => import("./views/ExpertEditView.vue"),
        },
        {
          path: "teams/new",
          component: () => import("./views/ExpertEditView.vue"),
        },
        {
          path: "teams/:definitionId/edit",
          component: () => import("./views/ExpertEditView.vue"),
        },
        { path: "skills", component: () => import("./views/SkillsView.vue") },
        {
          path: "skills/new",
          component: () => import("./views/SkillEditView.vue"),
        },
        {
          path: "skills/upload",
          component: () => import("./views/SkillUploadView.vue"),
        },
        {
          path: "skills/:resourceId/edit",
          component: () => import("./views/SkillEditView.vue"),
        },
        {
          path: "connectors",
          component: () => import("./views/ConnectorsView.vue"),
        },
        { path: "tools", component: () => import("./views/ToolsView.vue") },
        {
          path: "knowledge-bases",
          component: () => import("./views/KnowledgeBasesView.vue"),
        },
        {
          path: "share-requests",
          component: () => import("./views/ShareRequestsView.vue"),
        },
        {
          path: "admin/access-denied",
          name: "admin-access-denied",
          component: () => import("./views/AdminView.vue"),
        },
        {
          path: "admin/:section",
          meta: { adminOnly: true },
          component: () => import("./views/AdminView.vue"),
        },
        {
          path: ":pathMatch(.*)*",
          component: () => import("./views/NotFoundView.vue"),
        },
      ],
    },
  ],
});

router.beforeEach((to) => {
  const { user, isAdmin } = useIdentity();
  if (to.meta.adminOnly && user.value && !isAdmin.value) {
    return { name: "admin-access-denied" };
  }
});
