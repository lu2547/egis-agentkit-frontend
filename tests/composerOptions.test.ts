import { describe, expect, it, vi } from "vitest";
import { createComposerPager } from "../src/domain/composerOptions";
import type { ComposerOption, ComposerOptionsPage } from "../src/types/api";

const option = (id: string): ComposerOption => ({
  id,
  name: id,
  detail: "",
  kind: "file",
});
const page = (start: number, next: string | null): ComposerOptionsPage => ({
  items: Array.from({ length: 10 }, (_, index) =>
    option(String(start + index)),
  ),
  next_cursor: next,
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe("composer request pagination", () => {
  it("retries an initial request failure without a cursor", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(page(0, null));
    const pager = createComposerPager(fetch);
    await pager.reset({ category: "context" });
    expect(pager.state.error).toBe("offline");
    await pager.loadMore();
    expect(pager.state.items).toHaveLength(10);
    expect(pager.state.error).toBe("");
  });
  it("loads ten per request and advances across the page boundary", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page(0, "next"))
      .mockResolvedValueOnce(page(10, null));
    const pager = createComposerPager(fetch);
    await pager.reset({
      category: "context",
      query: "report",
      session_id: "session",
    });
    expect(fetch.mock.calls[0][0]).toMatchObject({
      limit: 10,
      category: "context",
      query: "report",
      session_id: "session",
    });
    pager.state.activeIndex = 9;
    await pager.move(1);
    expect(fetch.mock.calls[1][0].cursor).toBe("next");
    expect(pager.state.items).toHaveLength(20);
    expect(pager.state.activeIndex).toBe(10);
    await pager.move(-1);
    expect(pager.state.activeIndex).toBe(9);
  });

  it("aborts old queries and ignores late results after a category or scope reset", async () => {
    const old = deferred<ComposerOptionsPage>();
    const fresh = deferred<ComposerOptionsPage>();
    const fetch = vi
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(fresh.promise);
    const pager = createComposerPager(fetch);
    const first = pager.reset({
      category: "context",
      query: "old",
      project_id: "old",
    });
    const second = pager.reset({
      category: "experts",
      query: "new",
      session_id: "new",
    });
    expect(fetch.mock.calls[0][1].aborted).toBe(true);
    fresh.resolve({ items: [option("fresh")], next_cursor: null });
    await second;
    old.resolve(page(0, "stale"));
    await first;
    expect(pager.state.items.map((item) => item.id)).toEqual(["fresh"]);
    expect(pager.state.cursor).toBeNull();
    expect(pager.state.loading).toBe(false);
  });

  it("coalesces scroll and keyboard requests for the same page", async () => {
    const next = deferred<ComposerOptionsPage>();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page(0, "next"))
      .mockReturnValueOnce(next.promise);
    const pager = createComposerPager(fetch);
    await pager.reset({ category: "skills" });
    pager.state.activeIndex = 9;
    const scroll = pager.loadMore();
    const keyboard = pager.move(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    next.resolve(page(10, null));
    await Promise.all([scroll, keyboard]);
    expect(pager.state.activeIndex).toBe(10);
  });

  it("clears immediately on close and never repopulates from an old response", async () => {
    const result = deferred<ComposerOptionsPage>();
    const pager = createComposerPager(() => result.promise);
    const request = pager.reset({ category: "context" });
    await pager.reset(null);
    result.resolve(page(0, null));
    await request;
    expect(pager.state.items).toEqual([]);
    expect(pager.state.loading).toBe(false);
  });

  it("keeps earlier rows on a page error and supports retry", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page(0, "next"))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(page(10, null));
    const pager = createComposerPager(fetch);
    await pager.reset({ category: "context" });
    await pager.loadMore();
    expect(pager.state.items).toHaveLength(10);
    expect(pager.state.error).toBe("offline");
    await pager.loadMore();
    expect(pager.state.items).toHaveLength(20);
    expect(pager.state.error).toBe("");
  });
});
