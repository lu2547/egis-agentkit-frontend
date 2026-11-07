<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import LoginView from "./views/LoginView.vue";
import { useIdentity } from "./composables/useIdentity";
const identity = useIdentity();
const unauthorized = () => identity.logout();
onMounted(() => {
  window.addEventListener("egis:unauthorized", unauthorized);
  void identity.load();
});
onUnmounted(() =>
  window.removeEventListener("egis:unauthorized", unauthorized),
);
</script>
<template>
  <div v-if="identity.loading.value && !identity.user.value" class="boot">
    <t-loading text="正在载入工作空间" />
  </div>
  <LoginView v-else-if="!identity.user.value" /><RouterView v-else />
</template>
<style scoped src="./styles/components/App.css"></style>
