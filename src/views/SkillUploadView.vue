<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { manager } from "../api/manager";
import { errorText } from "../api/http";
import { useAsyncData } from "../composables/useAsyncData";
import { useSkillImports } from "../composables/useSkillImports";
import SkillMetadataFields from "../components/skills/SkillMetadataFields.vue";
import SkillImportList from "../components/skills/SkillImportList.vue";
import ResourceFormHeader from "../components/common/ResourceFormHeader.vue";
import ResourceFormActions from "../components/common/ResourceFormActions.vue";
const router = useRouter();
const file = ref<File | null>(null),
  category = ref("办公协同"),
  avatar = ref("skill:deep-thinking"),
  pending = ref(false),
  error = ref(""),
  fileInput = ref<HTMLInputElement>();
const { data, load } = useAsyncData(() => manager.resources("skills"));
void load();
const categories = computed(() => [
  ...new Set(
    (data.value?.items || [])
      .map((r) => String(r.payload.category || ""))
      .filter(Boolean),
  ),
]);
const imports = useSkillImports();
function choose(event: Event) {
  file.value = (event.target as HTMLInputElement).files?.[0] || null;
}
function back() {
  return router.push("/skills");
}
async function upload() {
  if (!file.value || pending.value) return;
  pending.value = true;
  error.value = "";
  try {
    const job = await manager.importSkill(
      file.value,
      category.value,
      avatar.value,
    );
    imports.track(job);
    file.value = null;
    if (fileInput.value) fileInput.value.value = "";
  } catch (e) {
    error.value = errorText(e);
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
        title="上传技能"
        description="上传包含 SKILL.md 的 ZIP 技能包，并选择分类和头像。"
        return-label="返回技能目录"
        @back="back"
      />
      <form class="form-stack skill-upload-form" @submit.prevent="upload">
        <p class="muted upload-help">
          名称和简介读取自 SKILL.md 的 frontmatter，版本读取 version 或
          metadata.version。提交后在后台处理，可返回目录继续工作，导入完成后技能才会出现在目录中。
        </p>
        <div class="field">
          <label for="skill-package">技能包（ZIP）</label
          ><input
            id="skill-package"
            ref="fileInput"
            type="file"
            accept=".zip"
            aria-label="选择技能文件"
            :disabled="pending"
            @change="choose"
          />
        </div>
        <SkillMetadataFields
          v-model:category="category"
          v-model:avatar="avatar"
          :categories="categories"
        />
        <div v-if="error" class="error" role="alert">{{ error }}</div>
        <ResourceFormActions
          submit-label="提交导入"
          :pending="pending"
          :disabled="!file || !category.trim()"
          @cancel="back"
        />
      </form>
      <SkillImportList
        :jobs="imports.jobs.value"
        :error="imports.error.value"
        :loading="imports.loading.value"
        :retrying="imports.retrying.value"
        @refresh="imports.refresh"
        @retry="imports.retry"
      />
    </div>
  </section>
</template>
<style scoped src="../styles/components/expert-edit.css"></style>
<style scoped src="../styles/components/skill-upload.css"></style>
