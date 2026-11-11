<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { manager } from "../api/manager";
import { errorText } from "../api/http";
import { useAsyncData } from "../composables/useAsyncData";
import { useIdentity } from "../composables/useIdentity";
import AsyncState from "../components/common/AsyncState.vue";
import ExpertForm from "../components/experts/ExpertForm.vue";
import ResourceFormHeader from "../components/common/ResourceFormHeader.vue";
const route = useRoute(),
  router = useRouter();
const { models, isAdmin } = useIdentity();
const team = computed(() => route.path.startsWith("/teams"));
const catalogPath = computed(() => {
  const source = route.query.returnTo;
  if (source === "/admin/remote-agents" && isAdmin.value) return source;
  return typeof source === "string" && /^\/experts(?:\?|$)/.test(source)
    ? source
    : team.value
      ? "/experts?tab=team"
      : "/experts";
});
function returnToCatalog() {
  return router.push(catalogPath.value);
}
const pending = ref(false),
  saveError = ref("");
const { data, loading, error, load } = useAsyncData(async () => {
  const definitionId = route.params.definitionId;
  const isTeam = team.value;
  const view = route.query.view === "system" ? "system" : "private";
  const [definition, agents, skills, connectors, tools] = await Promise.all([
    typeof definitionId === "string"
      ? manager.definition(isTeam ? "teams" : "agents", definitionId, view)
      : undefined,
    isTeam ? manager.definitions("agents") : undefined,
    manager.resources("skills"),
    manager.resources("connectors"),
    manager.resources("tools"),
  ]);
  if (definition && !definition.is_editable)
    throw new Error("你没有编辑这个资源的权限。");
  if (definition && isTeam && !definition.orchestrator_config)
    throw new Error("未能读取主理人配置，请刷新后重试。");
  return {
    definition,
    experts: agents?.items ?? [],
    skills: skills.items,
    connectors: connectors.items,
    tools: tools.items,
  };
});
watch(() => route.fullPath, load, { immediate: true });
async function save(body: unknown) {
  pending.value = true;
  saveError.value = "";
  try {
    await manager.saveDefinition(
      team.value ? "teams" : "agents",
      body,
      data.value?.definition?.id,
    );
    await returnToCatalog();
  } catch (e) {
    saveError.value = errorText(e);
  } finally {
    pending.value = false;
  }
}
</script>
<template>
  <section class="page edit-page">
    <div class="edit-content">
      <ResourceFormHeader
        level="h1"
        :title="`${route.params.definitionId ? '编辑' : '创建'}${team ? '专家团' : '专家'}`"
        :description="
          team
            ? '配置主理人和固定成员。每次保存都会发布新版本。'
            : '配置专家的指令与能力。每次保存都会发布新版本。'
        "
        :return-label="`返回${team ? '专家团' : '专家'}目录`"
        @back="returnToCatalog"
      />
      <AsyncState :loading="loading" :error="error" @retry="load"
        ><div v-if="data">
          <ExpertForm
            :key="String(route.params.definitionId || route.path)"
            :definition="data.definition"
            :team="team"
            :experts="data.experts"
            :skills="data.skills"
            :connectors="data.connectors"
            :tools="data.tools"
            :models="models"
            :is-admin="isAdmin"
            :start-remote="isAdmin && route.query.execution === 'remote'"
            :pending="pending"
            :save-error="saveError"
            @save="save"
            @cancel="returnToCatalog"
          /></div
      ></AsyncState>
    </div>
  </section>
</template>
<style scoped src="../styles/components/expert-edit.css"></style>
