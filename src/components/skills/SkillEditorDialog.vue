<script setup lang="ts">
import { catalogIconUrl } from "../../domain/catalogIcons";
import AvatarPicker from "../common/AvatarPicker.vue";
import ResourceFormHeader from "../common/ResourceFormHeader.vue";
import ResourceFormActions from "../common/ResourceFormActions.vue";
import { ref, reactive, watch } from "vue";
import type { Resource } from "../../types/api";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";
const props = defineProps<{ visible: boolean; resource?: Resource | null }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const form = reactive({
    resource_id: "",
    resource_version: "",
    display_name: "",
    description: "",
    markdown: "",
    avatar: "book",
    is_skill_market_visible: true,
  }),
  pending = ref(false),
  error = ref("");
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      const r = props.resource;
      Object.assign(form, {
        resource_id: r?.resource_id || "",
        resource_version: r ? "" : "1.0.0",
        display_name: r?.display_name || "",
        description: r?.description || "",
        markdown: String(r?.payload.markdown || ""),
        avatar:
          catalogIconUrl(r?.payload.avatar) ||
          ["spark", "book", "team", "code"].includes(
            String(r?.payload.avatar || ""),
          )
            ? String(r?.payload.avatar)
            : "book",
        is_skill_market_visible: r?.is_skill_market_visible ?? true,
      });
      error.value = "";
    }
  },
);
async function save() {
  pending.value = true;
  error.value = "";
  try {
    await manager.saveResource("skills", form);
    emit("saved");
    emit("close");
  } catch (e) {
    error.value = errorText(e);
  } finally {
    pending.value = false;
  }
}
</script>
<template>
  <t-dialog
    role="dialog"
    aria-modal="true"
    :aria-label="resource ? '发布技能新版本' : '创建技能'"
    :visible="visible"
    :header="true"
    :footer="false"
    width="740px"
    @close="$emit('close')"
    ><template #header
      ><ResourceFormHeader
        :title="resource ? '发布技能新版本' : '创建技能'"
        description="整理可复用的工作步骤、输入输出与协作规范。"
        return-label="返回技能目录"
        @back="$emit('close')"
    /></template>
    <form class="form-stack" @submit.prevent="save">
      <div class="form-row">
        <div v-field-label class="field">
          <label>技能 ID</label
          ><t-input
            v-model="form.resource_id"
            :disabled="!!resource"
            placeholder="research_skill"
          />
        </div>
        <div v-field-label class="field">
          <label>版本</label
          ><t-input
            v-model="form.resource_version"
            placeholder="例如 1.0.1"
          /><small v-if="resource"
            >发布新版本，保留现有 {{ resource.resource_version }}。</small
          >
        </div>
      </div>
      <div v-field-label class="field">
        <label>技能名称</label><t-input v-model="form.display_name" />
      </div>
      <div v-field-label class="field">
        <label>简介</label
        ><t-textarea
          v-model="form.description"
          :autosize="{ minRows: 2, maxRows: 3 }"
        />
      </div>
      <div v-field-label class="field">
        <label>头像</label><AvatarPicker v-model="form.avatar" kind="skill" />
      </div>
      <div v-field-label class="field">
        <label>技能文档（Markdown）</label
        ><t-textarea
          v-model="form.markdown"
          :autosize="{ minRows: 10, maxRows: 20 }"
          placeholder="描述步骤、输入输出与工作规范"
        />
      </div>
      <t-checkbox v-model="form.is_skill_market_visible"
        >在技能广场展示（仍需共享审核与使用授权）</t-checkbox
      >
      <div v-if="error" class="error" role="alert">{{ error }}</div>
      <ResourceFormActions
        submit-label="发布版本"
        :pending="pending"
        :disabled="
          !form.resource_id ||
          !form.resource_version ||
          !form.display_name ||
          !form.markdown
        "
        @cancel="$emit('close')"
      /></form
  ></t-dialog>
</template>
