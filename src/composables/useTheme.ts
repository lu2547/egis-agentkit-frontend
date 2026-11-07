import { ref } from "vue";
export type ThemePreference = "light" | "dark" | "system";
const preference = ref<ThemePreference>("system");
const theme = ref<"light" | "dark">("light");
const key = "pension-gpt-theme";
let initialized = false;
let system: MediaQueryList | undefined;
function apply() {
  theme.value =
    preference.value === "system"
      ? system?.matches
        ? "dark"
        : "light"
      : preference.value;
  document.documentElement.dataset.theme = theme.value;
  document.documentElement.classList.toggle("dark", theme.value === "dark");
  document.documentElement.setAttribute("theme-mode", theme.value);
}
export function initializeTheme() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  system = window.matchMedia("(prefers-color-scheme: dark)");
  try {
    const saved = localStorage.getItem(key);
    if (saved === "light" || saved === "dark" || saved === "system")
      preference.value = saved;
  } catch {
    /* A disabled localStorage does not prevent a session theme. */
  }
  system.addEventListener("change", () => {
    if (preference.value === "system") apply();
  });
  apply();
}
export function useTheme() {
  function setTheme(value: ThemePreference) {
    preference.value = value;
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Keep the current session usable. */
    }
    apply();
  }
  return {
    preference,
    theme,
    setTheme,
    toggle: () => setTheme(theme.value === "dark" ? "light" : "dark"),
  };
}
