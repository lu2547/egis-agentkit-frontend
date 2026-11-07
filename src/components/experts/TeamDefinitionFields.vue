<script setup lang="ts">
import type { Definition, DefinitionRef } from "../../types/api";
import { definitionName } from "../../types/api";
const props = defineProps<{
  name: string;
  displayName: string;
  prompt: string;
  members: DefinitionRef[];
  experts: Definition[];
}>();
const emit = defineEmits<{
  "update:name": [v: string];
  "update:displayName": [v: string];
  "update:prompt": [v: string];
  "update:members": [v: DefinitionRef[]];
}>();
function update(value: unknown) {
  emit(
    "update:members",
    (Array.isArray(value) ? value : []).map((v) => {
      const [id, view] = String(v).split("|");
      return {
        definition_id: id,
        resource_view_type: view as DefinitionRef["resource_view_type"],
      };
    }),
  );
}
</script>
<template>
  <div class="team-fields">
    <h3 class="section-title">团内主理人</h3>
    <p class="muted help">
      主理人只在团队中负责分工与协作，不作为独立专家召唤。
    </p>
    <div class="form-row">
      <div v-field-label class="field">
        <label>主理人英文名</label
        ><t-input
          :value="name"
          placeholder="team_orchestrator"
          @update:value="(v: string) => $emit('update:name', v)"
        />
      </div>
      <div v-field-label class="field">
        <label>主理人展示名</label
        ><t-input
          :value="displayName"
          placeholder="项目主理人"
          @update:value="(v: string) => $emit('update:displayName', v)"
        />
      </div>
    </div>
    <div v-field-label class="field">
      <label>协作说明</label
      ><t-textarea
        :value="prompt"
        :autosize="{ minRows: 4, maxRows: 12 }"
        placeholder="描述主理人如何分工、协调和汇总结果"
        @update:value="(v: string) => $emit('update:prompt', v)"
      />
    </div>
    <div v-field-label class="field">
      <label>固定专家成员</label
      ><t-select
        multiple
        filterable
        :value="
          members.map((r) => `${r.definition_id}|${r.resource_view_type}`)
        "
        :options="
          experts
            .filter((d) => d.agent_type === 'expert' && d.is_usable)
            .map((d) => ({
              label: definitionName(d),
              value: `${d.id}|${d.resource_view_type}`,
            }))
        "
        placeholder="选择至少一位专家"
        @change="update"
      /><small>成员保留各自的提示词与 Skill/MCP 配置。</small>
    </div>
  </div>
</template>
<style scoped src="../../styles/components/TeamDefinitionFields.css"></style>
