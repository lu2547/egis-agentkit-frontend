import { reactive } from "vue";
import type {
  ComposerOption,
  ComposerOptionsPage,
  ComposerOptionsQuery,
} from "../types/api";

export function createComposerPager(
  fetchPage: (
    query: ComposerOptionsQuery,
    signal: AbortSignal,
  ) => Promise<ComposerOptionsPage>,
) {
  const state = reactive({
    items: [] as ComposerOption[],
    cursor: null as string | null,
    loading: false,
    error: "",
    activeIndex: 0,
  });
  let query: ComposerOptionsQuery | null = null;
  let generation = 0;
  let controller: AbortController | undefined;
  let inFlight: Promise<void> | undefined;

  function load(initial: boolean): Promise<void> {
    if (inFlight) return inFlight;
    if (!query || (!initial && !state.cursor)) return Promise.resolve();
    const requestGeneration = generation;
    controller = new AbortController();
    const signal = controller.signal;
    const params = {
      ...query,
      cursor: initial ? undefined : state.cursor!,
    };
    state.loading = true;
    state.error = "";
    const request = (async () => {
      try {
        const result = await fetchPage(params, signal);
        if (generation !== requestGeneration) return;
        const seen = new Set(state.items.map((item) => item.id));
        state.items.push(...result.items.filter((item) => !seen.has(item.id)));
        state.cursor = result.next_cursor;
      } catch (error) {
        if (generation === requestGeneration && !signal.aborted)
          state.error = error instanceof Error ? error.message : String(error);
      } finally {
        if (generation === requestGeneration) {
          state.loading = false;
          inFlight = undefined;
        }
      }
    })();
    inFlight = request;
    return request;
  }

  function reset(next: ComposerOptionsQuery | null): Promise<void> {
    generation++;
    controller?.abort();
    inFlight = undefined;
    query = next;
    state.items = [];
    state.cursor = null;
    state.loading = false;
    state.error = "";
    state.activeIndex = 0;
    return next ? load(true) : Promise.resolve();
  }

  async function move(direction: 1 | -1) {
    const requestGeneration = generation;
    const next = state.activeIndex + direction;
    if (direction === 1 && next >= state.items.length && state.cursor)
      await load(false);
    if (generation !== requestGeneration || !state.items.length) return;
    state.activeIndex = Math.max(0, Math.min(next, state.items.length - 1));
  }

  return {
    state,
    reset,
    loadMore: () => load(!state.items.length && !!state.error),
    move,
  };
}
