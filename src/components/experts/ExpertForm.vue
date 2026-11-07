<script setup lang="ts">
import { reactive, computed } from "vue";
import type {
  Definition,
  Resource,
  ResourceBinding,
  DefinitionRef,
  ModelOption,
} from "../../types/api";
import { catalogIconUrl } from "../../domain/catalogIcons";
import AvatarPicker from "../common/AvatarPicker.vue";
import ExpertIdentityFields from "./ExpertIdentityFields.vue";
import AgentResourceBindings from "./AgentResourceBindings.vue";
import TeamDefinitionFields from "./TeamDefinitionFields.vue";
import ResourceFormActions from "../common/ResourceFormActions.vue";
const props = defineProps<{
  definition?: Definition;
  team: boolean;
  experts: Definition[];
  skills: Resource[];
  connectors: Resource[];
  models: ModelOption[];
  pending: boolean;
}>();
const emit = defineEmits<{ save: [body: unknown]; cancel: [] }>();
const original = props.definition;
const leader = original?.orchestrator_config;
const form = reactive({
  name: original?.agent_name || original?.team_name || "",
  displayName:
    original?.agent_display_name || original?.team_display_name || "",
  description: original?.payload.description || "",
  category: original?.payload.category || "办公协同",
  tags: original?.payload.tags.join("，") || "",
  avatar: catalogIconUrl(original?.payload.avatar) || ["spark", "book", "team", "code"].includes(original?.payload.avatar || "") ? original!.payload.avatar! : "spark",
  prompt: original?.payload.system_prompt || "",
  starters: original?.payload.starter_prompts.join("\n") || "",
  model:
    (props.team ? leader?.payload.model_key : original?.payload.model_key) ||
    "",
  bindings:
    (props.team ? leader?.payload.bindings : original?.payload.bindings) ||
    ([] as ResourceBinding[]),
  members: original?.payload.members || ([] as DefinitionRef[]),
  leaderName: leader?.agent_name || "",
  leaderDisplayName: leader?.agent_display_name || "",
  leaderPrompt: leader?.payload.system_prompt || "",
});
const valid = computed(
  () =>
    /^[a-z][a-z0-9_-]{0,127}$/.test(form.name) &&
    form.displayName.trim() &&
    (!props.team ||
      (form.members.length &&
        /^[a-z][a-z0-9_-]{0,127}$/.test(form.leaderName) &&
        form.leaderDisplayName.trim())),
);
function submit() {
  if (!valid.value) return;
  const common = {
    description: form.description,
    category: form.category,
    tags: form.tags
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean),
    avatar: form.avatar,
    starter_prompts: form.starters
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean),
  };
  const body: Record<string, unknown> = props.team
    ? {
        team_name: form.name,
        team_display_name: form.displayName,
        payload: {
          ...common,
          ...(original ? { orchestrator: original.payload.orchestrator } : {}),
          members: form.members,
        },
        members: form.members,
        ...(form.leaderName
          ? {
              orchestrator_config: {
                agent_name: form.leaderName,
                agent_display_name: form.leaderDisplayName,
                payload: {
                  ...leader?.payload,
                  system_prompt: form.leaderPrompt,
                  bindings: form.bindings,
                  model_key: form.model || null,
                },
              },
            }
          : {}),
      }
    : {
        agent_name: form.name,
        agent_display_name: form.displayName,
        payload: {
          ...common,
          system_prompt: form.prompt,
          bindings: form.bindings,
          model_key: form.model || null,
          ...(original?.payload.implementation
            ? { implementation: original.payload.implementation }
            : {}),
        },
      };
  if (original) body.config_version = original.config_version;
  emit("save", body);
}
</script>
<template>
  <form class="form-stack" @submit.prevent="submit">
    <ExpertIdentityFields
      v-model:name="form.name"
      v-model:display-name="form.displayName"
      v-model:description="form.description"
      :team="team"
    />
    <div class="form-row">
      <div v-field-label class="field">
        <label>分类</label
        ><t-input
          v-model="form.category"
          :maxlength="64"
          placeholder="例如 办公协同"
        />
      </div>
      <div v-field-label class="field">
        <label>标签</label
        ><t-input v-model="form.tags" placeholder="多个标签用逗号分隔" /><small
          >最多 20 个标签。</small
        >
      </div>
    </div>
    <div v-field-label class="field">
      <label>头像</label><AvatarPicker v-model="form.avatar" kind="expert" />
    </div>
    <div v-if="!team" v-field-label class="field">
      <label>系统指令</label
      ><t-textarea
        v-model="form.prompt"
        :autosize="{ minRows: 7, maxRows: 20 }"
        :maxlength="64000"
        placeholder="说明专家的角色、工作方法与交付要求"
      />
    </div>
    <TeamDefinitionFields
      v-else
      v-model:name="form.leaderName"
      v-model:display-name="form.leaderDisplayName"
      v-model:prompt="form.leaderPrompt"
      v-model:members="form.members"
      :experts="experts"
    /><AgentResourceBindings
      v-model="form.bindings"
      :skills="skills"
      :connectors="connectors"
    />
    <div v-field-label class="field">
      <label>快捷提问</label
      ><t-textarea
        v-model="form.starters"
        :autosize="{ minRows: 3, maxRows: 10 }"
        placeholder="每行一个示例提问，最多 10 个"
      />
    </div>
    <div v-field-label class="field">
      <label>默认模型</label
      ><t-select
        v-model="form.model"
        clearable
        :options="models.map((m) => ({ label: m.display_name, value: m.key }))"
        placeholder="使用默认模型"
      />
    </div>
    <p class="save-note">
      保存后即可自己使用。需要面向其他用户时，可单独申请共享。
    </p>
    <ResourceFormActions :submit-label="`保存${team ? '专家团' : '专家'}`" :disabled="!valid" :pending="pending" @cancel="$emit('cancel')" />
  </form>
</template>
<style scoped src="../../styles/components/expert-form.css"></style>
