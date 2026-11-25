import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { CatalogPage, Resource } from "../src/types/api";
vi.mock("../src/api/manager", () => ({
  manager: { resourceCatalog: vi.fn(), resource: vi.fn() },
}));
import { manager } from "../src/api/manager";
import { useSkillChoices } from "../src/composables/useSkillChoices";
const skill = (id: string) =>
  ({
    resource_id: id,
    resource_version: "v1",
    display_name: id,
    is_usable: true,
    can_share: true,
  }) as Resource;

describe("paged skill choices", () => {
  it("pages and searches on the server while retaining selected choices from previous pages", async () => {
    vi.mocked(manager.resourceCatalog)
      .mockResolvedValueOnce({ items: [skill("first")], next_cursor: "page2" })
      .mockResolvedValueOnce({ items: [skill("second")], next_cursor: null })
      .mockResolvedValueOnce({ items: [skill("found")], next_cursor: null });
    const selected = ref<string[]>([]);
    const choices = useSkillChoices(selected, "usable", "version");
    await choices.search("");
    selected.value = ["first@v1"];
    await choices.loadMore();
    selected.value.push("second@v1");
    await choices.search("found");
    expect(manager.resourceCatalog).toHaveBeenNthCalledWith(
      2,
      "skills",
      expect.objectContaining({ cursor: "page2", query: "" }),
      expect.any(AbortSignal),
    );
    expect(manager.resourceCatalog).toHaveBeenLastCalledWith(
      "skills",
      expect.objectContaining({ query: "found", cursor: null }),
      expect.any(AbortSignal),
    );
    expect(choices.options.value.map((option) => option.value)).toEqual([
      "first@v1",
      "second@v1",
      "found@v1",
    ]);
    expect(selected.value).toEqual(["first@v1", "second@v1"]);
  });
  it("ignores a superseded search response", async () => {
    let finish!: (page: CatalogPage<Resource>) => void;
    vi.mocked(manager.resourceCatalog)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      )
      .mockResolvedValueOnce({ items: [skill("current")], next_cursor: null });
    const choices = useSkillChoices(ref([]), "share", "id");
    const old = choices.search("old");
    await choices.search("current");
    finish({ items: [skill("old")], next_cursor: "obsolete" });
    await old;
    expect(choices.options.value.map((option) => option.value)).toEqual([
      "current",
    ]);
    expect(choices.hasMore.value).toBe(false);
  });
  it("uses authorized system management choices for grants and fetches saved binding versions directly", async () => {
    vi.mocked(manager.resourceCatalog).mockResolvedValue({
      items: [skill("system")],
      next_cursor: null,
    });
    vi.mocked(manager.resource).mockResolvedValue(skill("saved"));
    const grants = useSkillChoices(ref([]), "grant", "id");
    await grants.search("");
    expect(manager.resourceCatalog).toHaveBeenLastCalledWith(
      "skills",
      expect.objectContaining({ purpose: "grant", owner_type: "system" }),
      expect.any(AbortSignal),
    );
    const selected = ref(["saved@v1"]);
    const bindings = useSkillChoices(selected, "usable", "version");
    await bindings.loadSelected();
    expect(manager.resource).toHaveBeenCalledWith("skills", "saved", "v1");
    expect(bindings.options.value).toContainEqual({
      label: "saved · v1",
      value: "saved@v1",
    });
  });
  it("does not reuse an old cursor after a new search fails", async () => {
    vi.mocked(manager.resourceCatalog)
      .mockResolvedValueOnce({ items: [skill("old")], next_cursor: "old-page" })
      .mockRejectedValueOnce(new Error("offline"));
    const choices = useSkillChoices(ref([]), "usable", "version");
    await choices.search("old");
    await choices.search("new");
    expect(choices.hasMore.value).toBe(false);
    expect(choices.error.value).toBe("offline");
  });
});
