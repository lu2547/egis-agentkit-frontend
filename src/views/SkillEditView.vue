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
  const catalog = await manager.resourceCatalog("skills", { limit: 1 }, new AbortController().signal);
  const resourceId = String(route.params.resourceId || "");
  const version = typeof route.query.version === "string" ? route.query.version : undefined;
  const resource = resourceId ? await manager.resource("skills", resourceId, version) : undefined;
  if (resource && !resource.is_editable)
    throw new Error("你没有编辑这个技能的权限。");
  return {
    resource,
    categories: catalog.categories || [],
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
  return router.push(route.query.system === "1" ? "/admin/skills" : "/skills");
}
async function save(body: SkillSaveInput) {
  pending.value = true;
  saveError.value = "";
  try {
    if (route.query.system === "1") await manager.registerSystemResource("skill", body);
    else await manager.saveResource("skills", body, data.value?.resource?.resource_id);
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
