<script setup lang="ts">
import { Check, Plus } from 'lucide-vue-next';
import type { Definition } from '../../types/api';
import { definitionName } from '../../types/api';
import CatalogAvatar from '../common/CatalogAvatar.vue';
defineProps<{ definition: Definition; candidatePending?: boolean }>();
defineEmits<{ detail: []; summon: []; edit: []; toggleCandidate: [] }>();
</script>
<template>
  <article class="catalog-card" data-testid="catalog-card">
    <button
      v-if="definition.is_usable || definition.is_invite_candidate"
      type="button"
      class="candidate-toggle"
      aria-label="自动邀请候选"
      :aria-pressed="!!definition.is_invite_candidate"
      :title="definition.is_invite_candidate ? '移出自动邀请候选' : '加入自动邀请候选'"
      :disabled="candidatePending"
      @click="$emit('toggleCandidate')"
    >
      <Check v-if="definition.is_invite_candidate" :size="16" aria-hidden="true" />
      <Plus v-else :size="16" aria-hidden="true" />
    </button>
    <button type="button" class="card-open" :aria-label="`查看${definitionName(definition)}`" @click="$emit('detail')">
      <span class="card-heading"><CatalogAvatar class="item-avatar" :avatar="definition.payload.avatar" :name="definitionName(definition)" /><span class="item-copy"><strong>{{ definitionName(definition) }}</strong><span class="item-description">{{ definition.payload.description }}</span></span></span>
      <span class="tags"><span v-for="tag in definition.payload.tags?.slice(0, 3)" :key="tag">{{ tag }}</span></span>
    </button>
    <footer class="card-footer"><span class="item-category">{{ definition.payload.category }}</span><span class="actions"><button v-if="definition.is_editable" type="button" class="connect-button" @click="$emit('edit')">编辑</button><button type="button" class="connect-button" :disabled="!definition.is_usable" @click="$emit('summon')">{{ definition.is_usable ? '召唤' : '未获授权' }}</button></span></footer>
  </article>
</template>
<style scoped src="../../styles/components/expert-card.css"></style>
