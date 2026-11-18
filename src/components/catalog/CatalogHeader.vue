<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { UserRound, UsersRound, Search, X, Plus, PackageCheck, PanelLeft, MessageCirclePlus, Upload, Check, Wrench } from 'lucide-vue-next';
import { useWorkbenchLayout } from '../../composables/useWorkbenchLayout';
import IconButton from '../common/IconButton.vue';
const props = defineProps<{ page: 'personal' | 'agent' | 'skills' | 'connectors' | 'tools'; query: string; selected?: boolean }>();
const emit = defineEmits<{ 'update:query': [value: string]; toggle: []; create: []; upload: [] }>();
const router = useRouter();
const { sidebarOpen, toggleSidebar } = useWorkbenchLayout();
const menuOpen = ref(false), menuAnchor = ref<HTMLElement>(), search = ref<HTMLInputElement>();
const tabs = [
  { id: 'personal', label: '个人助理', path: '/experts?tab=personal' },
  { id: 'agent', label: '专家', path: '/experts?tab=agent' },
  { id: 'team', label: '专家团', path: undefined },
  { id: 'skills', label: '技能', path: '/skills' },
  { id: 'connectors', label: '连接器', path: '/connectors' },
  { id: 'tools', label: '工具', path: '/tools' },
] as const;
function dismissMenu(event: PointerEvent) { if (menuOpen.value && event.target instanceof Node && !menuAnchor.value?.contains(event.target)) menuOpen.value = false; }
function onMenuKeydown(event: KeyboardEvent) { if (menuOpen.value && event.key === 'Escape' && !event.isComposing) { event.preventDefault(); menuOpen.value = false; menuAnchor.value?.querySelector('button')?.focus(); } }
onMounted(() => { document.addEventListener('pointerdown', dismissMenu); document.addEventListener('keydown', onMenuKeydown); });
onBeforeUnmount(() => { document.removeEventListener('pointerdown', dismissMenu); document.removeEventListener('keydown', onMenuKeydown); });
watch(() => props.page, () => { menuOpen.value = false; });
</script>
<template>
  <header class="catalog-header">
    <div class="catalog-header-left">
      <template v-if="!sidebarOpen"><IconButton label="展开侧边栏" @click="toggleSidebar"><PanelLeft :size="16" /></IconButton><IconButton label="新建任务" @click="router.push('/')"><MessageCirclePlus :size="16" /></IconButton><span class="navigation-divider" /></template>
      <nav class="catalog-tabs" aria-label="能力目录">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          :class="{ active: page === tab.id }"
          :aria-current="page === tab.id ? 'page' : undefined"
          :disabled="!tab.path"
          @click="tab.path && router.push(tab.path)"
        >
          <UserRound v-if="tab.id === 'personal'" :size="20" />
          <UsersRound v-else-if="tab.id === 'team'" :size="20" />
          <Wrench v-else-if="tab.id === 'tools'" :size="20" />
          <span v-else class="catalog-tab-icon" :style="{ maskImage: `url(/catalog/icons/${tab.id === 'agent' ? 'experts' : tab.id}.svg)` }" />
          {{ tab.label }}
          <small v-if="!tab.path" class="catalog-tab-status">建设中</small>
        </button>
      </nav>
    </div>
    <div v-if="page !== 'personal'" class="catalog-header-right">
      <label class="catalog-search"><Search :size="14"/><input ref="search" :value="query" :aria-label="`搜索${tabs.find(tab => tab.id === page)?.label}`" :placeholder="`搜索${tabs.find(tab => tab.id === page)?.label}`" @input="emit('update:query', ($event.target as HTMLInputElement).value)" /><button v-if="query" type="button" aria-label="清空搜索" @click="emit('update:query', '')"><X :size="14" /></button></label>
      <button v-if="page === 'skills' || page === 'agent'" type="button" class="filter-button" :class="{active:selected}" :aria-pressed="!!selected" @click="emit('toggle')"><PackageCheck :size="16"/>{{ page === 'skills' ? '我安装的' : '我的专家' }}</button>
      <div v-if="page !== 'connectors' && page !== 'tools'" ref="menuAnchor" class="add-menu-anchor"><button type="button" class="add-skill" :aria-expanded="page === 'skills' ? menuOpen : undefined" @click="page === 'skills' ? menuOpen = !menuOpen : emit('create')"><Plus :size="16"/>添加{{ tabs.find(tab => tab.id === page)?.label }}</button><div v-if="page === 'skills' && menuOpen" class="add-menu" role="menu"><button type="button" role="menuitem" @click="menuOpen = false; emit('upload')"><Upload :size="15"/>上传技能</button><button type="button" role="menuitem" @click="menuOpen = false; emit('create')"><Check :size="15"/>创建技能</button></div></div>
    </div>
  </header>
</template>
<style scoped src="../../styles/components/catalog-header.css"></style>
