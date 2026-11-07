export class ResourceDetailState<T> {
  value: T | undefined;
  selectedVersion = "";
  loading = false;
  error = "";
  private generation = 0;
  async select(version: string, load: () => Promise<T>) {
    const key = ++this.generation;
    this.selectedVersion = version;
    this.loading = true;
    this.error = "";
    this.value = undefined;
    try {
      const value = await load();
      if (key === this.generation) this.value = value;
    } catch (e) {
      if (key === this.generation)
        this.error = e instanceof Error ? e.message : String(e);
    } finally {
      if (key === this.generation) this.loading = false;
    }
  }
  dispose() {
    this.generation++;
  }
}
export class ResourceInstallation {
  pending = false;
  constructor(public enabled: boolean) {}
  async change(enabled: boolean, save: () => Promise<unknown>) {
    if (this.pending) return;
    this.pending = true;
    try {
      await save();
      this.enabled = enabled;
    } finally {
      this.pending = false;
    }
  }
}
