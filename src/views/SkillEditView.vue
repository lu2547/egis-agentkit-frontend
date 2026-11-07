<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { manager } from "../api/manager";
import { errorText } from "../api/http";
import { useAsyncData } from "../composables/useAsyncData";
import AsyncState from "../components/common/AsyncState.vue";
import ResourceFormHeader from "../components/common/ResourceFormHeader.vue";
import SkillForm from "../components/skills/SkillForm.vue";
import type { SkillSaveInput } from "../types/api";
const route = useRoute(),
  router = useRouter();
const pending = ref(false),
  saveError = ref("");
const { data, loading, error, load } = useAsyncData(async () => {
  const catalog = await manager.resources("skills");
  const resourceId = String(route.params.resourceId || "");
  const selected = catalog.items.find(
    (r) =>
      r.resource_id === resourceId &&
      r.is_editable &&
      (!route.query.version || r.resource_version === route.query.version),
  );
  if (resourceId && !selected)
    throw new Error("找不到可编辑的技能，或你没有编辑权限。");
  const resource = selected
    ? await manager.resource(
        "skills",
        selected.resource_id,
        selected.resource_version,
      )
    : undefined;
  if (resource && !resource.is_editable)
    throw new Error("你没有编辑这个技能的权限。");
  return {
    resource,
    categories: [
      ...new Set(
        catalog.items
          .map((r) => String(r.payload.category || ""))
          .filter(Boolean),
      ),
    ],
  };
});
watch(
  () => route.fullPath,
  () => {
    saveError.value = "";
    void load();
  },
  { immediate: true },
);
function back() {
  return router.push("/skills");
}
async function save(body: SkillSaveInput) {
  pending.value = true;
  saveError.value = "";
  try {
    await manager.saveResource(
      "skills",
      body,
      data.value?.resource?.resource_id,
    );
    await back();
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
        :title="route.params.resourceId ? '编辑技能' : '创建技能'"
        description="编辑完整的 SKILL.md，管理可复用的工作步骤与配套资料。"
        return-label="返回技能目录"
        @back="back"
      />
      <AsyncState :loading="loading" :error="error" @retry="load"
        ><div v-if="data">
          <div v-if="saveError" class="error save-error" role="alert">
            {{ saveError }}
          </div>
          <SkillForm
            :key="route.fullPath"
            :resource="data.resource"
            :categories="data.categories"
            :pending="pending"
            @save="save"
            @cancel="back"
          /></div
      ></AsyncState>
    </div>
  </section>
</template>
<style scoped src="../styles/components/expert-edit.css"></style>
