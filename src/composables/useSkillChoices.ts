import { computed, ref, type Ref } from "vue";
import { manager } from "../api/manager";
import { errorText } from "../api/http";
import type { Resource } from "../types/api";

export type SkillChoicePurpose = "usable" | "share" | "grant";
export function useSkillChoices(
  selected: Readonly<Ref<string[]>>,
  purpose: SkillChoicePurpose,
  keyMode: "id" | "version",
) {
  const items = ref<Resource[]>([]),
    cache = ref(new Map<string, Resource>()),
    loading = ref(false),
    error = ref(""),
    hasMore = ref(false);
  let cursor: string | null = null,
    query = "",
    request = 0;
  let controller: AbortController | undefined;
  const key = (resource: Resource) =>
    keyMode === "id"
      ? resource.resource_id
      : `${resource.resource_id}@${resource.resource_version}`;
  const allowed = (resource: Resource) =>
    purpose === "usable"
      ? resource.is_usable
      : purpose === "share"
        ? resource.can_share
        : resource.owner_type === "system";
  function remember(resources: Resource[]) {
    for (const resource of resources) cache.value.set(key(resource), resource);
  }
  const resources = computed(() => [...cache.value.values()]);
  const options = computed(() =>
    [
      ...new Set([...selected.value, ...items.value.filter(allowed).map(key)]),
    ].map((value) => {
      const resource = cache.value.get(value);
      return {
        value,
        label: resource
          ? `${resource.display_name}${keyMode === "version" ? ` · ${resource.version_label || resource.resource_version}` : ""}`
          : value.replace("@", " · "),
      };
    }),
  );
  async function fetchPage(reset: boolean) {
    if (!reset && (loading.value || !hasMore.value)) return;
    controller?.abort();
    controller = new AbortController();
    const current = ++request,
      signal = controller.signal;
    loading.value = true;
    error.value = "";
    try {
      const page = await manager.resourceCatalog(
        "skills",
        {
          query,
          cursor: reset ? null : cursor,
          limit: 20,
          ...(purpose === "share" ? { mine: true } : {}),
          ...(purpose === "grant"
            ? { purpose: "grant", owner_type: "system" }
            : {}),
        },
        signal,
      );
      if (current !== request || signal.aborted) return;
      remember(page.items);
      items.value = reset ? page.items : [...items.value, ...page.items];
      cursor = page.next_cursor;
      hasMore.value = cursor !== null;
    } catch (cause) {
      if (current === request && !signal.aborted)
        error.value = errorText(cause);
    } finally {
      if (current === request) loading.value = false;
    }
  }
  async function search(value: string) {
    query = value;
    cursor = null;
    hasMore.value = false;
    items.value = [];
    return fetchPage(true);
  }
  async function loadSelected() {
    if (keyMode !== "version") return;
    await Promise.all(
      selected.value
        .filter((value) => !cache.value.has(value))
        .map(async (value) => {
          const separator = value.lastIndexOf("@");
          if (separator < 0) return;
          try {
            remember([
              await manager.resource(
                "skills",
                value.slice(0, separator),
                value.slice(separator + 1),
              ),
            ]);
          } catch {
            /* Keep the original binding selectable even if access changed. */
          }
        }),
    );
  }
  function dispose() {
    ++request;
    controller?.abort();
  }
  return {
    items,
    options,
    resources,
    loading,
    error,
    hasMore,
    search,
    loadMore: () => fetchPage(false),
    loadSelected,
    dispose,
  };
}
