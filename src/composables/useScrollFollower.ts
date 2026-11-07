import { nextTick, onScopeDispose, ref, watch, type Ref } from "vue";

/** Follow streamed content until the reader starts scrolling or exploring history. */
export function useScrollFollower(
  viewport: Ref<HTMLElement | null>,
  content: Ref<HTMLElement | null>,
) {
  const sticky = ref(true);
  let frame = 0;
  let previousTime = 0;
  let dispose: (() => void) | undefined;
  function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
  }
  function pause() {
    stop();
    sticky.value = false;
  }
  function onScroll() {
    const el = viewport.value;
    if (el && !frame)
      sticky.value = el.scrollHeight - el.scrollTop - el.clientHeight < 3;
  }
  function follow(animate = true) {
    const el = viewport.value;
    if (!el || !sticky.value) return;
    if (
      !animate ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      stop();
      el.scrollTop = el.scrollHeight;
      return;
    }
    if (frame) return;
    function step(time: number) {
      const current = viewport.value;
      if (!current || !sticky.value) {
        stop();
        return;
      }
      const target = Math.max(0, current.scrollHeight - current.clientHeight);
      const distance = target - current.scrollTop;
      if (Math.abs(distance) < 1) {
        current.scrollTop = target;
        stop();
        return;
      }
      const elapsed = previousTime ? Math.min(64, time - previousTime) : 16;
      previousTime = time;
      current.scrollTop += distance * (1 - Math.exp(-elapsed / 45));
      frame = requestAnimationFrame(step);
    }
    frame = requestAnimationFrame(step);
  }
  async function scrollToBottom(animate = true) {
    sticky.value = true;
    await nextTick();
    follow(animate);
  }
  watch(
    [viewport, content],
    ([el, body]) => {
      dispose?.();
      stop();
      if (!el || !body) return;
      const keys = (event: KeyboardEvent) => {
        if (
          [
            "ArrowUp",
            "ArrowDown",
            "PageUp",
            "PageDown",
            "Home",
            "End",
            " ",
          ].includes(event.key)
        )
          pause();
      };
      el.addEventListener("wheel", pause, { passive: true });
      el.addEventListener("touchstart", pause, { passive: true });
      el.addEventListener("pointerdown", pause);
      el.addEventListener("keydown", keys);
      const observer = new ResizeObserver(() => follow());
      observer.observe(body);
      dispose = () => {
        observer.disconnect();
        el.removeEventListener("wheel", pause);
        el.removeEventListener("touchstart", pause);
        el.removeEventListener("pointerdown", pause);
        el.removeEventListener("keydown", keys);
      };
      void scrollToBottom(false);
    },
    { flush: "post" },
  );
  onScopeDispose(() => {
    stop();
    dispose?.();
  });
  return { sticky, follow, onScroll, scrollToBottom };
}
