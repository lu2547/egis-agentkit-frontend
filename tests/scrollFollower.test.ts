import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, shallowRef } from "vue";
import { useScrollFollower } from "../src/composables/useScrollFollower";

class Viewport extends EventTarget {
  scrollHeight = 1000;
  clientHeight = 400;
  private top = 0;
  get scrollTop() {
    return this.top;
  }
  set scrollTop(value: number) {
    this.top = Math.min(
      Math.max(0, value),
      this.scrollHeight - this.clientHeight,
    );
  }
}
let resize: () => void;
let disconnected: boolean;
let frames: Map<number, FrameRequestCallback>;
let frameId: number;
let reduced: boolean;
const scopes: ReturnType<typeof effectScope>[] = [];
beforeEach(() => {
  frames = new Map();
  frameId = 0;
  reduced = false;
  disconnected = false;
  vi.stubGlobal("window", { matchMedia: () => ({ matches: reduced }) });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {
        disconnected = true;
      }
    },
  );
});
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.unstubAllGlobals();
});
async function mount() {
  const viewport = shallowRef<HTMLElement | null>(null);
  const content = shallowRef<HTMLElement | null>(null);
  const scope = effectScope();
  scopes.push(scope);
  const follower = scope.run(() => useScrollFollower(viewport, content))!;
  const el = new Viewport();
  viewport.value = el as unknown as HTMLElement;
  content.value = {} as HTMLElement;
  await nextTick();
  await nextTick();
  return { ...follower, el, scope };
}
function tick(time = 16) {
  const queued = [...frames.values()];
  frames.clear();
  queued.forEach((callback) => callback(time));
}
describe("stream scroll following", () => {
  it("opens at the end and coalesces stream deltas into one smooth animation", async () => {
    const { el, follow } = await mount();
    expect(el.scrollTop).toBe(600);
    el.scrollHeight = 1800;
    follow();
    follow();
    resize();
    expect(frames.size).toBe(1);
    tick();
    expect(el.scrollTop).toBeGreaterThan(600);
    expect(el.scrollTop).toBeLessThan(1400);
    for (let time = 32; time < 1000; time += 16) tick(time);
    expect(el.scrollTop).toBe(1400);
    expect(frames.size).toBe(0);
  });
  it("does not pull a reader back after manual scrolling and resumes on explicit request", async () => {
    const { el, follow, onScroll, sticky, scrollToBottom } = await mount();
    el.scrollHeight = 1800;
    follow();
    tick();
    el.dispatchEvent(new Event("wheel"));
    el.scrollTop = 100;
    onScroll();
    el.scrollHeight = 2200;
    resize();
    follow();
    expect(sticky.value).toBe(false);
    expect(el.scrollTop).toBe(100);
    expect(frames.size).toBe(0);
    await scrollToBottom();
    for (let time = 16; time < 1000; time += 16) tick(time);
    expect(el.scrollTop).toBe(1800);
  });
  it("honors reduced motion and releases observers and pending animation on disposal", async () => {
    const { el, follow, scope } = await mount();
    reduced = true;
    el.scrollHeight = 1800;
    follow();
    expect(el.scrollTop).toBe(1400);
    expect(frames.size).toBe(0);
    reduced = false;
    el.scrollHeight = 2200;
    follow();
    expect(frames.size).toBe(1);
    scope.stop();
    expect(frames.size).toBe(0);
    expect(disconnected).toBe(true);
  });
});
