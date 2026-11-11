import { computed, ref } from "vue";
import { manager } from "../api/manager";
import { getToken, setToken, errorText } from "../api/http";
import type {
  User,
  Task,
  Project,
  Definition,
  ModelOption,
} from "../types/api";
import { useTaskActivity } from "./useTaskActivity";
const activity = useTaskActivity();
let taskGeneration = 0;
let projectGeneration = 0;
const user = ref<User | null>(null),
  tasks = ref<Task[]>([]),
  projects = ref<Project[]>([]),
  assistant = ref<Definition | null>(null),
  models = ref<ModelOption[]>([]),
  defaultModelKey = ref(""),
  error = ref(""),
  loading = ref(false);
const isAdmin = computed(
  () => user.value?.is_enabled === true && user.value.role_type === "admin",
);
export function useIdentity() {
  async function refreshProjects() {
    const request = ++projectGeneration;
    try {
      const items = (await manager.projects()).items;
      if (request === projectGeneration && user.value) projects.value = items;
    } catch (e) {
      error.value = errorText(e);
    }
  }
  async function refreshTasks() {
    const request = ++taskGeneration;
    try {
      const items = (await manager.tasks()).items;
      if (request !== taskGeneration || !user.value) return;
      tasks.value = items;
      activity.update(items);
    } catch (e) {
      error.value = errorText(e);
    }
  }
  async function load() {
    if (!getToken()) return;
    loading.value = true;
    error.value = "";
    try {
      user.value = await manager.me();
      activity.setUser(user.value.user_id);
      await Promise.all([
        refreshTasks(),
        refreshProjects(),
        manager.assistant().then((x) => (assistant.value = x)),
        manager.models().then((x) => {
          models.value = x.items;
          defaultModelKey.value = x.default_key || "";
        }),
      ]);
    } catch (e) {
      error.value = errorText(e);
    } finally {
      loading.value = false;
    }
  }
  function logout() {
    ++taskGeneration;
    ++projectGeneration;
    activity.reset();
    setToken(null);
    user.value = null;
    tasks.value = [];
    projects.value = [];
    assistant.value = null;
    models.value = [];
    defaultModelKey.value = "";
  }
  return {
    user,
    isAdmin,
    tasks,
    projects,
    assistant,
    models,
    defaultModelKey,
    error,
    loading,
    load,
    logout,
    refreshTasks,
    refreshProjects,
  };
}
