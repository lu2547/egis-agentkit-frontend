<script setup lang="ts">
import { computed } from "vue";
import {
  Plus,
  Search,
  MessageCircle,
  MessageCirclePlus,
  UsersRound,
  Sparkles,
  Link,
  Folder,
  FileText,
  ChevronRight,
  ChevronDown,
  X,
  Menu,
  Settings,
  UserRound,
  ArrowUp,
  Square,
  Check,
  LogOut,
  Download,
  Pencil,
  PanelLeft,
  RefreshCw,
  Trash2,
  ShieldCheck,
  BookOpen,
  MoreHorizontal,
  Sun,
  Moon,
  LayoutGrid,
  Bell,
  PanelRight,
} from "lucide-vue-next";
const props = withDefaults(defineProps<{ name: string; size?: number }>(), {
  size: 19,
});
const icons: Record<string, unknown> = {
  plus: Plus,
  search: Search,
  chat: MessageCircle,
  new: MessageCirclePlus,
  team: UsersRound,
  personal: UserRound,
  spark: Sparkles,
  link: Link,
  folder: Folder,
  file: FileText,
  chevron: ChevronRight,
  down: ChevronDown,
  close: X,
  menu: Menu,
  settings: Settings,
  user: UserRound,
  send: ArrowUp,
  stop: Square,
  check: Check,
  logout: LogOut,
  download: Download,
  edit: Pencil,
  panel: PanelLeft,
  refresh: RefreshCw,
  trash: Trash2,
  shield: ShieldCheck,
  book: BookOpen,
  more: MoreHorizontal,
  sun: Sun,
  moon: Moon,
  grid: LayoutGrid,
  bell: Bell,
  right: PanelRight,
};
const component = computed(() => icons[props.name] || FileText);
</script>
<template>
  <span
    v-if="name === 'personal'"
    class="personal-brand-icon"
    :style="{ width: `${size + 3}px`, height: `${size + 3}px` }"
    aria-hidden="true"
  ><img src="/brand/sheep-head-v1.png" alt="" style="width:100%;height:100%;object-fit:contain" /></span>
  <span
    v-else-if="['experts', 'skill', 'connector'].includes(name)"
    class="catalog-icon"
    :class="`catalog-icon-${name}`"
    :style="{ width: `${size}px`, height: `${size}px` }"
    aria-hidden="true"
  />
  <component
    v-else
    :is="component"
    class="icon"
    :size="size"
    :style="{ width: `${size}px`, height: `${size}px` }"
    :stroke-width="1.65"
    aria-hidden="true"
  />
</template>
<style scoped src="../../styles/components/AppIcon.css"></style>
