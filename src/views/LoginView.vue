<script setup lang="ts">
import { ref } from "vue";
import BrandIdentity from "../components/common/BrandIdentity.vue";
import { manager } from "../api/manager";
import { setToken, errorText } from "../api/http";
import { useIdentity } from "../composables/useIdentity";
const userId = ref(""),
  password = ref(""),
  pending = ref(false),
  error = ref("");
const identity = useIdentity();
async function login() {
  if (!userId.value || !password.value) return;
  pending.value = true;
  error.value = "";
  try {
    const result = await manager.login(userId.value, password.value);
    if (!result.access_token) throw new Error("登录响应缺少访问令牌");
    setToken(result.access_token);
    await identity.load();
    if (!identity.user.value) error.value = identity.error.value;
  } catch (e) {
    error.value = errorText(e);
  } finally {
    pending.value = false;
  }
}
</script>
<template>
  <main class="login">
    <section class="login-panel">
      <h1 class="login-brand" aria-label="养老险GPT">
        <BrandIdentity class="login-wordmark" />
      </h1>
      <form class="form-stack" @submit.prevent="login">
        <div v-field-label class="field">
          <label for="login-user">UM账号</label
          ><t-input
            id="login-user"
            v-model="userId"
            autocomplete="username"
            placeholder="输入UM账号"
          />
        </div>
        <div v-field-label class="field">
          <label for="login-password">密码</label
          ><t-input
            id="login-password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            placeholder="输入密码"
          />
        </div>
        <div v-if="error" class="error" role="alert">{{ error }}</div>
        <t-button
          theme="primary"
          type="submit"
          block
          :loading="pending"
          :disabled="!userId || !password"
          >登录</t-button
        >
      </form>
    </section>
  </main>
</template>
<style scoped src="../styles/components/LoginView.css"></style>
