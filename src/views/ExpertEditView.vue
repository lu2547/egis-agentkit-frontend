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
const team = computed(() => route.path.startsWith("/teams"));
const catalogPath = computed(() => {
  const source = route.query.returnTo;
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
const { models } = useIdentity();
const { data, loading, error, load } = useAsyncData(async () => {
  const [agents, teams, skills, connectors] = await Promise.all([
    manager.definitions("agents"),
    manager.definitions("teams"),
    manager.resources("skills"),
    manager.resources("connectors"),
  ]);
  let definition =
    [...agents.items, ...teams.items].find(
      (d) =>
        d.id === route.params.definitionId &&
        d.resource_view_type === "private",
    ) ||
    [...agents.items, ...teams.items].find(
      (d) => d.id === route.params.definitionId && d.is_editable,
    );
  if (route.params.definitionId && !definition)
    throw new Error("找不到可编辑的资源，或你没有编辑权限。");
  if (definition && !definition.is_editable)
    throw new Error("你没有编辑这个资源的权限。");
  if (definition && team.value) {
    definition = await manager.definition(
      "teams",
      definition.id,
      definition.resource_view_type,
    );
    if (!definition.is_editable) throw new Error("你没有编辑这个资源的权限。");
    if (!definition.orchestrator_config)
      throw new Error("未能读取主理人配置，请刷新后重试。");
  }
  return {
    definition,
    experts: agents.items,
    skills: skills.items,
    connectors: connectors.items,
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
            ? '配置主理人和固定成员，让多位专家协同工作。'
            : '用清晰的指令与合适的能力，打造专属工作伙伴。'
        "
        :return-label="`返回${team ? '专家团' : '专家'}目录`"
        @back="returnToCatalog"
      />
      <AsyncState :loading="loading" :error="error" @retry="load"
        ><div v-if="data">
          <div v-if="saveError" class="error save-error" role="alert">
            {{ saveError }}
          </div>
          <ExpertForm
            :key="String(route.params.definitionId || route.path)"
            :definition="data.definition"
            :team="team"
            :experts="data.experts"
            :skills="data.skills"
            :connectors="data.connectors"
            :models="models"
            :pending="pending"
            @save="save"
            @cancel="returnToCatalog"
          /></div
      ></AsyncState>
    </div>
  </section>
</template>
<style scoped src="../styles/components/expert-edit.css"></style>
