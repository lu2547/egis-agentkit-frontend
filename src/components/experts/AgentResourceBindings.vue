<script setup lang="ts">
import { useIdentity } from "../../composables/useIdentity";
import type { Resource, ResourceBinding } from "../../types/api";
const { user } = useIdentity();
const props = defineProps<{
  modelValue: ResourceBinding[];
  skills: Resource[];
  connectors: Resource[];
}>();
const emit = defineEmits<{ "update:modelValue": [v: ResourceBinding[]] }>();
function update(type: "skill" | "mcp", ids: unknown) {
  const resources = type === "skill" ? props.skills : props.connectors;
  const keys = Array.isArray(ids) ? ids : [];
  emit("update:modelValue", [
    ...props.modelValue.filter((b) => b.resource_type !== type),
    ...keys.map((key) => {
      const r = resources.find(
        (r) => `${r.resource_id}@${r.resource_version}` === key,
      )!;
      return {
        resource_type: type,
        resource_id: r.resource_id,
        resource_version: r.resource_version,
        resource_view_type:
          r.resource_view_type ||
          (r.owner_type === "system"
            ? "system"
            : r.owner_id === user.value?.user_id
              ? "private"
              : "shared"),
      };
    }),
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
            .map((b) => `${b.resource_id}@${b.resource_version}`)
        "
        multiple
        clearable
        filterable
        :options="
          connectors
            .filter((r) => r.is_usable)
            .map((r) => ({
              label: `${r.display_name} · ${r.resource_version}`,
              value: `${r.resource_id}@${r.resource_version}`,
            }))
        "
        placeholder="选择可使用的连接器"
        @change="update('mcp', $event)"
      />
    </div>
  </div>
</template>
