<script setup lang="ts">
import type { Resource, ResourceBinding } from "../../types/api";
const props = defineProps<{
  modelValue: ResourceBinding[];
  skills: Resource[];
  connectors: Resource[];
  tools: Resource[];
}>();
const emit = defineEmits<{ "update:modelValue": [v: ResourceBinding[]] }>();
function update(type: ResourceBinding["resource_type"], ids: unknown) {
  const resources = { skill: props.skills, mcp: props.connectors, tool: props.tools }[type];
  const keys = Array.isArray(ids) ? ids : [];
  if (type === "mcp") {
    const allowed = new Set([
      ...props.connectors.filter((r) => r.is_usable).map((r) => r.resource_id),
      ...props.modelValue.filter((b) => b.resource_type === type).map((b) => b.resource_id),
    ]);
    emit("update:modelValue", [
      ...props.modelValue.filter((b) => b.resource_type !== type),
      ...[...new Set(keys)].filter((id) => allowed.has(id)).map((id): ResourceBinding => ({
        resource_type: "mcp",
        resource_id: id,
        resource_view_type: "system",
      })),
    ]);
    return;
  }
  emit("update:modelValue", [
    ...props.modelValue.filter((b) => b.resource_type !== type),
    ...keys.map((key) => {
      const r = resources.find(
        (r) => `${r.resource_id}@${r.resource_version}` === key,
      );
      if (!r?.resource_version) return props.modelValue.find(
        (b) => b.resource_type === type && `${b.resource_id}@${b.resource_version}` === key,
      );
      return {
        resource_type: type,
        resource_id: r.resource_id,
        resource_version: r.resource_version,
        resource_view_type: r.resource_view_type,
      };
    }).filter((binding): binding is ResourceBinding => !!binding),
  ]);
}
</script>
<template>
  <div class="form-row">
    <div v-field-label class="field">
      <label>绑定技能</label
      ><t-select
        :value="
          modelValue
            .filter((b) => b.resource_type === 'skill')
            .map((b) => `${b.resource_id}@${b.resource_version}`)
        "
        multiple
        clearable
        filterable
        :options="
          skills
            .filter((r) => r.is_usable)
            .map((r) => ({
              label: `${r.display_name} · ${r.resource_version}`,
              value: `${r.resource_id}@${r.resource_version}`,
            }))
        "
        placeholder="选择可使用的技能"
        @change="update('skill', $event)"
      />
    </div>
    <div v-field-label class="field">
      <label>绑定连接器</label
      ><t-select
        :value="
          modelValue
            .filter((b) => b.resource_type === 'mcp')
            .map((b) => b.resource_id)
        "
        multiple
        clearable
        filterable
        :options="
          connectors
            .filter((r) => r.is_usable)
            .map((r) => ({
              label: r.display_name,
              value: r.resource_id,
            }))
        "
        placeholder="选择可使用的连接器"
        @change="update('mcp', $event)"
      />
    </div>
    <div v-field-label class="field">
      <label>绑定工具</label>
      <t-select
        :value="modelValue.filter((b) => b.resource_type === 'tool').map((b) => `${b.resource_id}@${b.resource_version}`)"
        multiple clearable filterable
        :options="tools.filter((r) => r.is_agent_tool).map((r) => ({
          label: `${r.display_name} · ${r.resource_version}`, value: `${r.resource_id}@${r.resource_version}`,
        }))"
        placeholder="选择专家工具"
        @change="update('tool', $event)"
      />
      <small>系统默认工具自动启用。</small>
    </div>
  </div>
</template>
