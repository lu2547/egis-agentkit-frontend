import { computed, ref } from "vue";
const collapsed = ref(false),
  drawer = ref(false),
  searchOpen = ref(false);
const isMobile = ref(typeof window !== "undefined" && window.innerWidth < 680);
export function useWorkbenchLayout() {
  function toggleSidebar() {
    if (isMobile.value) drawer.value = !drawer.value;
    else collapsed.value = !collapsed.value;
  }
  return {
    collapsed,
    drawer,
    isMobile,
    searchOpen,
    sidebarOpen: computed(() =>
      isMobile.value ? drawer.value : !collapsed.value,
    ),
    toggleSidebar,
    openSearch: () => {
      searchOpen.value = true;
    },
    closeSidebarOnMobile: () => {
      drawer.value = false;
    },
    resize: () => {
      isMobile.value = window.innerWidth < 680;
      if (!isMobile.value) drawer.value = false;
    },
  };
}
