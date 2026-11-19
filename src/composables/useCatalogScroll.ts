import {
  computed,
  onScopeDispose,
  ref,
  shallowRef,
  watch,
  type Ref,
} from "vue";
import { errorText } from "../api/http";
import type { CatalogPage, CatalogQuery } from "../types/api";

const SEARCH_DELAY_MS = 250;
const WHEEL_GESTURE_GAP_MS = 180;

type PageRequest = { cursor: string | null; pages: number };

export function useCatalogScroll<T>(
  fetchPage: (
    query: CatalogQuery,
    signal: AbortSignal,
  ) => Promise<CatalogPage<T>>,
  itemKey: (item: T) => string,
  filters: {
    search: Ref<string>;
    category?: Ref<string>;
    mine?: Ref<boolean>;
    enabled?: Ref<boolean>;
  },
) {
  const scrollRoot = ref<HTMLElement | null>(null);
  const items = shallowRef<T[]>([]);
  const categories = ref<string[]>([]);
  const hasShareable = ref(false);
  const pending = ref(false);
  const requestError = ref("");
  const nextCursor = ref<string | null>(null);

  let controller: AbortController | undefined;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let previousScrollTop = 0;
  let previousWheelTime = -Infinity;
  let loadedPages = 0;
  let lastAttempt: PageRequest = { cursor: null, pages: 1 };

  const query = computed(() => filters.search.value.trim());
  const category = computed(() =>
    filters.category?.value === "全部" ? undefined : filters.category?.value,
  );
  const mine = computed(() => filters.mine?.value ?? false);
  const enabled = computed(() => filters.enabled?.value ?? true);

  function cancel() {
    clearTimeout(searchTimer);
    controller?.abort();
  }

  async function load(request: PageRequest) {
    if (!enabled.value) return;
    cancel();
    const current = new AbortController();
    controller = current;
    lastAttempt = request;
    pending.value = true;
    requestError.value = "";
    const params = {
      query: query.value || undefined,
      category: category.value,
      mine: mine.value,
    };
    const collected = new Map(
      request.cursor ? items.value.map((item) => [itemKey(item), item]) : [],
    );
    let firstPage: CatalogPage<T> | undefined;
    let count = 0;
    let cursor = request.cursor;
    try {
      do {
        const page = await fetchPage({ ...params, cursor }, current.signal);
        if (current.signal.aborted) return;
        if (cursor === null) firstPage = page;
        for (const item of page.items) collected.set(itemKey(item), item);
        count++;
        cursor =
          page.next_cursor !== cursor ? (page.next_cursor ?? null) : null;
      } while (cursor && count < request.pages);
      items.value = [...collected.values()];
      nextCursor.value = cursor;
      loadedPages = request.cursor ? loadedPages + count : count;
      if (firstPage) {
        categories.value = firstPage.categories ?? [];
        hasShareable.value = firstPage.has_shareable ?? false;
      }
    } catch (error) {
      if (!current.signal.aborted) requestError.value = errorText(error);
    } finally {
      if (!current.signal.aborted) {
        pending.value = false;
        controller = undefined;
      }
    }
  }

  function refresh() {
    // Apply mutations without discarding the pages already reached by scrolling.
    return load({ cursor: null, pages: Math.max(1, loadedPages) });
  }

  function loadMore() {
    if (nextCursor.value && !pending.value) {
      return load({ cursor: nextCursor.value, pages: 1 });
    }
  }

  function retry() {
    return load(lastAttempt);
  }

  function onScroll() {
    const root = scrollRoot.value;
    if (!root) return;
    const movingDown = root.scrollTop > previousScrollTop;
    previousScrollTop = root.scrollTop;
    if (
      movingDown &&
      root.scrollHeight - root.clientHeight - root.scrollTop <= 1 &&
      !requestError.value
    ) {
      void loadMore();
    }
  }

  function onWheel(event: WheelEvent) {
    const startsGesture =
      event.timeStamp - previousWheelTime > WHEEL_GESTURE_GAP_MS;
    previousWheelTime = event.timeStamp;
    const root = scrollRoot.value;
    // A full page can fit in the viewport, leaving no scroll event to handle.
    if (
      startsGesture &&
      event.deltaY > 0 &&
      !event.ctrlKey &&
      !event.shiftKey &&
      root &&
      root.scrollHeight === root.clientHeight &&
      !requestError.value
    ) {
      void loadMore();
    }
  }

  watch(
    [query, category, mine, enabled],
    (
      [value, selectedCategory, selectedMine, active],
      [lastQuery, lastCategory, lastMine, wasActive],
    ) => {
      cancel();
      items.value = [];
      nextCursor.value = null;
      requestError.value = "";
      loadedPages = 0;
      previousScrollTop = 0;
      previousWheelTime = -Infinity;
      if (scrollRoot.value) scrollRoot.value.scrollTop = 0;
      pending.value = active;
      if (!active) return;
      if (
        wasActive &&
        value !== lastQuery &&
        selectedCategory === lastCategory &&
        selectedMine === lastMine
      ) {
        searchTimer = setTimeout(refresh, SEARCH_DELAY_MS);
      } else {
        void refresh();
      }
    },
    { immediate: true },
  );
  onScopeDispose(cancel);

  return {
    scrollRoot,
    items,
    categories,
    hasShareable,
    loading: computed(() => pending.value && !items.value.length),
    error: computed(() => (items.value.length ? "" : requestError.value)),
    hasMore: computed(() => nextCursor.value !== null),
    loadingMore: computed(() => pending.value && items.value.length > 0),
    moreError: computed(() => (items.value.length ? requestError.value : "")),
    onScroll,
    onWheel,
    loadMore,
    refresh,
    retry,
  };
}
