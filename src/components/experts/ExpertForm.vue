<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import type {
  Definition,
  Resource,
  ResourceBinding,
  DefinitionRef,
  ModelOption,
  RemoteAgentConfig,
} from "../../types/api";
import { catalogIconUrl } from "../../domain/catalogIcons";
import AvatarPicker from "../common/AvatarPicker.vue";
import ExpertIdentityFields from "./ExpertIdentityFields.vue";
import AgentResourceBindings from "./AgentResourceBindings.vue";
import TeamDefinitionFields from "./TeamDefinitionFields.vue";
import ResourceFormActions from "../common/ResourceFormActions.vue";
import RemoteExpertFields from "./RemoteExpertFields.vue";
const props = defineProps<{
  definition?: Definition;
  team: boolean;
  experts: Definition[];
  connectors: Resource[];
  tools?: Resource[];
  models: ModelOption[];
  pending: boolean;
  saveError?: string;
  isAdmin?: boolean;
  startRemote?: boolean;
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
  executionType: original ? (original.agent_type === "remote" ? "remote" : "native") : (props.startRemote ? "remote" : "native"),
  remote: {
    transport: "http_sync",
    protocol_version: "v1",
    endpoint: "",
    credential_ref: "",
    ...original?.payload.remote_config,
  } as RemoteAgentConfig,
});
const isRemote = computed(() => !props.team && form.executionType === "remote");
const canSaveRemote = computed(() => {
  if (!isRemote.value) return true;
  if (!props.isAdmin) return false;
  const { endpoint, transport, credential_ref, callback_secret_ref } = form.remote;
  const scheme = transport === "websocket" ? /^wss?:\/\// : /^https?:\/\//;
  const isReference = (value = "") => /^EGIS_REMOTE_AGENT_[A-Z0-9_]+$/.test(value.trim());
  return scheme.test(endpoint.trim()) && isReference(credential_ref)
    && (transport !== "http_callback" || isReference(callback_secret_ref));
});
const namePattern = /^[a-z][a-z0-9_-]{0,127}$/;
const validationError = computed(() => {
  if (!form.name.trim()) return "请输入英文名称。";
  if (!namePattern.test(form.name.trim()))
    return "英文名称须以小写字母开头，只能包含小写字母、数字、下划线和短横线。";
  if (!form.displayName.trim()) return "请输入展示名称。";
  if (!canSaveRemote.value)
    return props.isAdmin
      ? "请检查远程连接地址和凭据引用。"
      : "仅管理员可以保存远程专家。";
  if (props.team) {
    if (!namePattern.test(form.leaderName.trim())) return "请填写有效的主理人英文名称。";
    if (!form.leaderDisplayName.trim()) return "请输入主理人展示名称。";
    if (!form.members.length) return "请至少添加一位固定成员。";
  }
  return "";
});
const attemptedSave = ref(false);
const formError = computed(() =>
  attemptedSave.value && validationError.value ? validationError.value : props.saveError,
);
function submit() {
  if (props.pending) return;
  attemptedSave.value = true;
  if (validationError.value) return;
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
        team_name: form.name.trim(),
        team_display_name: form.displayName.trim(),
        payload: {
          ...common,
          ...(original ? { orchestrator: original.payload.orchestrator } : {}),
          members: form.members,
        },
        members: form.members,
        ...(form.leaderName
          ? {
              orchestrator_config: {
                agent_name: form.leaderName.trim(),
                agent_display_name: form.leaderDisplayName.trim(),
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
        agent_type: isRemote.value ? "remote" : "expert",
        agent_name: form.name.trim(),
        agent_display_name: form.displayName.trim(),
        payload: {
          ...common,
          model_key: form.model || null,
          ...(isRemote.value
            ? {
                remote_config: {
                  ...form.remote,
                  endpoint: form.remote.endpoint.trim(),
                  credential_ref: form.remote.credential_ref.trim(),
                  callback_secret_ref: form.remote.transport === "http_callback"
                    ? form.remote.callback_secret_ref?.trim() : undefined,
                  cancel_endpoint: form.remote.transport !== "websocket"
                    ? form.remote.cancel_endpoint?.trim() || undefined : undefined,
                },
              }
            : {
                system_prompt: form.prompt,
                bindings: form.bindings,
              }),
        },
      };
  if (original) {
    body.owner_version = original.owner_version;
    if (!props.team) {
      delete body.agent_type;
    }
    if (props.team) {
      body.owner_type = original.owner_type;
      body.owner_id = original.owner_id;
    }
  }
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
    <div v-if="!team && isAdmin" v-field-label class="field">
      <label>专家执行方式</label>
      <t-select
        v-model="form.executionType"
        :disabled="!!original"
        :options="[
          { label: '原生专家', value: 'native' },
          { label: '远程专家', value: 'remote' },
        ]"
      />
    </div>
    <RemoteExpertFields v-if="isRemote && isAdmin" v-model="form.remote" />
    <div v-if="!team && !isRemote" v-field-label class="field">
      <label>系统指令</label
      ><t-textarea
        v-model="form.prompt"
        :autosize="{ minRows: 7, maxRows: 20 }"
        :maxlength="64000"
        placeholder="说明专家的角色、工作方法与交付要求"
      />
    </div>
    <TeamDefinitionFields
      v-if="team"
      v-model:name="form.leaderName"
      v-model:display-name="form.leaderDisplayName"
      v-model:prompt="form.leaderPrompt"
      v-model:members="form.members"
      :experts="experts"
    /><AgentResourceBindings
      v-if="!isRemote"
      v-model="form.bindings"
      :connectors="connectors"
      :tools="tools || []"
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
    <p v-if="formError" class="save-error" role="alert">{{ formError }}</p>
    <ResourceFormActions :submit-label="`保存${team ? '专家团' : '专家'}`" :disabled="pending" :pending="pending" @cancel="$emit('cancel')" />
  </form>
</template>
<style scoped src="../../styles/components/expert-form.css"></style>
