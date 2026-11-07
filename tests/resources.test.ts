import { it, expect } from "vitest";
import {
  ResourceDetailState,
  ResourceInstallation,
} from "../src/domain/resourceState";
it("ignores a stale version response when a newer version was selected", async () => {
  let release!: (v: { version: string }) => void;
  const state = new ResourceDetailState<{ version: string }>();
  const first = state.select(
    "v1",
    () => new Promise((resolve) => (release = resolve)),
  );
  await state.select("v2", async () => ({ version: "v2" }));
  release({ version: "v1" });
  await first;
  expect(state.value).toEqual({ version: "v2" });
  expect(state.selectedVersion).toBe("v2");
});
it("does not enable a resource when the installation API rejects it", async () => {
  const state = new ResourceInstallation(false);
  await expect(
    state.change(true, async () => {
      throw new Error("未获授权");
    }),
  ).rejects.toThrow("未获授权");
  expect(state.enabled).toBe(false);
  expect(state.pending).toBe(false);
});
it("prevents overlapping installation changes while one is pending", async () => {
  const state = new ResourceInstallation(false);
  let finish!: () => void;
  const first = state.change(
    true,
    () => new Promise<void>((resolve) => (finish = resolve)),
  );
  let secondCalled = false;
  await state.change(false, async () => {
    secondCalled = true;
  });
  expect(secondCalled).toBe(false);
  finish();
  await first;
  expect(state.enabled).toBe(true);
});
