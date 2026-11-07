<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import AppSidebar from "../components/navigation/AppSidebar.vue";
import GlobalSearch from "../components/navigation/GlobalSearch.vue";
import { useWorkbenchLayout } from "../composables/useWorkbenchLayout";
const layout = useWorkbenchLayout(),
  width = ref(280),
  resizing = ref(false);
let stopResize: (() => void) | undefined;
function resize(e: PointerEvent) {
  if (e.button !== 0) return;
  stopResize?.();
  resizing.value = true;
  const start = e.clientX,
    initial = width.value;
  const move = (event: PointerEvent) => {
    width.value = Math.max(240, Math.min(360, initial + event.clientX - start));
  };
  const stop = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("pointercancel", stop);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    stopResize = undefined;
    resizing.value = false;
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop);
  window.addEventListener("pointercancel", stop);
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  stopResize = stop;
}
function resizeKey(e: KeyboardEvent) {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  e.preventDefault();
  width.value = Math.max(
    240,
    Math.min(360, width.value + (e.key === "ArrowRight" ? 16 : -16)),
  );
}
function keydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    layout.searchOpen.value = !layout.searchOpen.value;
  }
  if (e.key === "Escape") layout.closeSidebarOnMobile();
}
onMounted(() => {
  window.addEventListener("keydown", keydown);
  window.addEventListener("resize", layout.resize);
});
onUnmounted(() => {
  window.removeEventListener("keydown", keydown);
  window.removeEventListener("resize", layout.resize);
  stopResize?.();
});
</script>
<template>
  <div class="workbench">
    <Transition name="scrim"
      ><button
        v-if="layout.isMobile.value && layout.drawer.value"
        class="panel-mask"
        aria-label="关闭侧栏遮罩"
        @click="layout.closeSidebarOnMobile"
    /></Transition>
    <Transition
      name="nav-drawer"
      @before-leave="
        (el) => {
          (el as HTMLElement).inert = true;
        }
      "
      @before-enter="
        (el) => {
          (el as HTMLElement).inert = false;
        }
      "
      ><div
        v-if="!layout.isMobile.value || layout.drawer.value"
        class="sidebar-slot desktop-sidebar"
        :class="{ overlay: layout.isMobile.value, 'is-resizing': resizing }"
        :style="{
          width: `${!layout.isMobile.value && layout.collapsed.value ? 48 : width}px`,
        }"
      >
        <AppSidebar
          :collapsed="!layout.isMobile.value && layout.collapsed.value"
          @collapse="layout.toggleSidebar"
          @navigate="layout.closeSidebarOnMobile"
          @search="layout.openSearch"
        />
        <button
          v-if="!layout.isMobile.value && !layout.collapsed.value"
          class="resize-handle"
          aria-label="调整侧边栏宽度"
          @pointerdown="resize"
          @keydown="resizeKey"
        /></div
    ></Transition>
    <main class="workbench-main">
      <RouterView v-slot="{ Component }"
        ><Transition name="page" mode="out-in"
          ><component :is="Component" /></Transition
      ></RouterView>
    </main>
    <GlobalSearch
      :open="layout.searchOpen.value"
      @close="layout.searchOpen.value = false"
    />
  </div>
</template>
<style scoped src="../styles/components/WorkbenchLayout.css"></style>
