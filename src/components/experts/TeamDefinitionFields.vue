<script setup lang="ts">
import { computed } from "vue";
import type { Definition, DefinitionRef } from "../../types/api";
import { definitionName, definitionRef } from "../../types/api";
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
const memberKey = (member: DefinitionRef) =>
  JSON.stringify([member.definition_id, member.resource_view_type, member.resource_version]);
/** 保留已选的历史成员版本，同时提供目录中的可用版本。 */
const choices = computed(() => {
  const byVersion = new Map(
    props.experts.filter((d) => (d.agent_type === "expert" || d.agent_type === "remote") && d.is_usable)
      .map((d) => {
        const member = definitionRef(d);
        return [memberKey(member), { member, name: definitionName(d) }] as const;
      }),
  );
  for (const member of props.members) {
    const key = memberKey(member);
    if (!byVersion.has(key)) {
      byVersion.set(key, { member, name: member.definition_id });
    }
  }
  return byVersion;
});
const options = computed(() =>
  [...choices.value].filter(([key, { member }]) =>
    !props.members.some((current) =>
      current.definition_id === member.definition_id && memberKey(current) !== key,
    ),
  ).map(([value, { member, name }]) => ({
    label: `${name} · ${member.resource_version}`,
    value,
  })),
);
function update(value: unknown) {
  const members = (Array.isArray(value) ? value : [])
    .map((key) => choices.value.get(key)?.member)
    .filter((member): member is DefinitionRef => !!member);
  emit("update:members", members);
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
        :value="members.map(memberKey)"
        :options="options"
        placeholder="选择至少一位专家"
        @change="update"
      /><small>成员固定使用所选发布版本的指令与能力配置。</small>
    </div>
  </div>
</template>
<style scoped src="../../styles/components/TeamDefinitionFields.css"></style>
