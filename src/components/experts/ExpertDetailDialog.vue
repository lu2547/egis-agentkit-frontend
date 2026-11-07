<script setup lang="ts">
import { computed } from "vue";
import type { Definition } from "../../types/api";
import { definitionName, sourceName } from "../../types/api";
import { X } from "lucide-vue-next";
import DialogShell from "../common/DialogShell.vue";
import IconButton from "../common/IconButton.vue";
import CatalogAvatar from "../common/CatalogAvatar.vue";
import PromptStarterList from "../composer/PromptStarterList.vue";
const props = defineProps<{
  definition: Definition | null;
  definitions: Definition[];
}>();
defineEmits<{ close: []; summon: [prompt?: string]; edit: []; share: [] }>();
const members = computed(
  () =>
    (props.definition?.payload.members
      ?.map((ref) =>
        props.definitions.find(
          (d) =>
            d.id === ref.definition_id &&
            d.resource_view_type === ref.resource_view_type,
        ),
      )
      .filter(Boolean) as Definition[]) || [],
);
</script>
<template>
  <DialogShell :open="!!definition" :label="definition ? definitionName(definition) : '目录详情'" :width="540" @close="$emit('close')">
    <div v-if="definition" class="detail-dialog">
      <div class="detail-heading"><CatalogAvatar class="large" :avatar="definition.payload.avatar" :name="definitionName(definition)" /><div class="detail-heading-body"><div class="detail-title-row"><h2>{{ definitionName(definition) }}</h2><span class="detail-name">{{ sourceName(definition.resource_view_type) }}</span></div><button class="primary-button detail-action" type="button" :disabled="!definition.is_usable" @click="$emit('summon')">{{ definition.is_usable ? '召唤' : '尚未获得使用授权' }}</button></div><IconButton label="关闭详情" @click="$emit('close')"><X :size="19" /></IconButton></div>
      <div class="detail-body"><p class="full-description">{{ definition.payload.description || '尚未填写简介' }}</p><div v-if="definition.payload.tags?.length" class="tags"><span v-for="tag in definition.payload.tags" :key="tag">{{ tag }}</span></div>
        <template v-if="definition.definition_type === 'team'"><h3 class="section-title">协作成员</h3><div class="members"><div v-for="member in members" :key="member.id"><CatalogAvatar :avatar="member.payload.avatar" :name="definitionName(member)"/><div>{{ definitionName(member) }}<small>{{ member.payload.description }}</small></div></div><p v-if="!members.length" class="muted">成员详情未在当前授权范围内。</p></div></template>
        <template v-if="definition.payload.starter_prompts?.length"><h3 class="section-title">可以这样开始</h3><PromptStarterList :prompts="definition.payload.starter_prompts" @select="$emit('summon', $event)" /></template>
        <div v-if="definition.payload.bindings?.length" class="capabilities"><span v-for="binding in definition.payload.bindings" :key="binding.resource_id" class="badge">{{ binding.resource_type === 'skill' ? '技能' : '连接器' }} · {{ binding.resource_id }}</span></div>
        <div class="detail-actions"><button v-if="definition.is_editable" class="secondary-button" @click="$emit('edit')">编辑</button><button v-if="definition.owner_type === 'user' && definition.is_editable" class="secondary-button" @click="$emit('share')">申请共享</button></div>
      </div>
    </div>
  </DialogShell>
</template>
<style scoped src="../../styles/components/expert-detail.css"></style>
