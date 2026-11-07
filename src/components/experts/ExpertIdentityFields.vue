<script setup lang="ts">
defineProps<{
  name: string;
  displayName: string;
  description: string;
  team?: boolean;
}>();
defineEmits<{
  "update:name": [v: string];
  "update:displayName": [v: string];
  "update:description": [v: string];
}>();
</script>
<template>
  <div class="form-row">
    <div v-field-label class="field">
      <label for="definition-name"
        >英文名称
        <span class="muted">{{
          team ? "team_name" : "agent_name"
        }}</span></label
      ><t-input
        id="definition-name"
        :value="name"
        placeholder="例如 research_expert"
        :maxlength="128"
        @update:value="(v: string) => $emit('update:name', v)"
      /><small>小写字母开头，可包含数字、下划线和短横线。</small>
    </div>
    <div v-field-label class="field">
      <label for="definition-display-name"
        >展示名称
        <span class="muted">{{
          team ? "team_display_name" : "agent_display_name"
        }}</span></label
      ><t-input
        id="definition-display-name"
        :value="displayName"
        placeholder="例如 研究专家"
        :maxlength="128"
        @update:value="(v: string) => $emit('update:displayName', v)"
      />
    </div>
  </div>
  <div v-field-label class="field">
    <label for="definition-description">简介</label
    ><t-textarea
      id="definition-description"
      :value="description"
      :maxlength="2000"
      :autosize="{ minRows: 2, maxRows: 5 }"
      placeholder="描述这位伙伴能帮助用户完成什么"
      @update:value="(v: string) => $emit('update:description', v)"
    />
  </div>
</template>
