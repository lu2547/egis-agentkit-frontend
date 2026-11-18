<script setup lang="ts">
import { reactive, computed } from "vue";
import type { Resource, SkillSaveInput } from "../../types/api";
import ResourceFormActions from "../common/ResourceFormActions.vue";
import SkillAttachmentList from "./SkillAttachmentList.vue";
import SkillMetadataFields from "./SkillMetadataFields.vue";
const props = defineProps<{
  resource?: Resource;
  categories: string[];
  pending: boolean;
}>();
const emit = defineEmits<{ save: [body: SkillSaveInput]; cancel: [] }>();
const form = reactive({
  resource_id: props.resource?.resource_id || "",
  markdown: props.resource
    ? String(props.resource.payload.markdown || "")
    : "---\nname: 我的技能\ndescription: 说明技能的用途与适用场景\nversion: 1.0.0\n---\n\n# 工作步骤\n\n1. 明确目标与输入。\n2. 执行工作并核对结果。\n",
  category: String(props.resource?.payload.category || "办公协同"),
  avatar: String(props.resource?.payload.avatar || "skill:deep-thinking"),
});
const files = computed(
  () =>
    (props.resource?.payload.files || []) as { path: string; size: number }[],
);
function save() {
  emit("save", {
    ...form,
    ...(props.resource
      ? { base_version: props.resource.resource_version }
      : {}),
  });
}
</script>
<template>
  <form class="form-stack" @submit.prevent="save">
    <div v-field-label class="field">
      <label>技能 ID</label
      ><t-input
        v-model="form.resource_id"
        :disabled="!!resource"
        placeholder="research_skill"
      />
    </div>
    <SkillMetadataFields
      v-model:category="form.category"
      v-model:avatar="form.avatar"
      :categories="categories"
    />
    <div v-field-label class="field">
      <label>SKILL.md 文档</label>
      <p class="skill-help">
        名称、简介读取文档开头的 name、description；版本读取 version 或
        metadata.version。发布新版本时，请在文档中更新版本。
      </p>
      <t-textarea
        v-model="form.markdown"
        :autosize="{ minRows: 20, maxRows: 40 }"
        placeholder="包含 YAML frontmatter 的完整 SKILL.md"
      />
    </div>
    <SkillAttachmentList
      v-if="resource"
      :files="files"
      :version="resource.resource_version || ''"
    />
    <ResourceFormActions
      submit-label="发布版本"
      :pending="pending"
      :disabled="
        !form.resource_id.trim() ||
        !form.markdown.trim() ||
        !form.category.trim()
      "
      @cancel="emit('cancel')"
    />
  </form>
</template>
<style scoped src="../../styles/components/skill-form.css"></style>
