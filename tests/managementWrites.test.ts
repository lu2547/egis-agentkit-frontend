import { describe, expect, it } from "vitest";
import { apiUrl } from "../src/api/http";
import { userWriteInput } from "../src/domain/userEditing";

describe("user management writes", () => {
  it("builds editable fields from a full audited user row", () => {
    const row = {
      user_id: "alice",
      username: "Alice",
      role_type: "user" as const,
      group_ids: ["company"],
      is_enabled: false,
      created_at: "2026-11-24",
      updated_at: "2026-11-25",
      created_by: "system",
      updated_by: "admin",
      identity_source_type: "sso",
    };
    const input = userWriteInput(row);
    expect(input).toEqual({
      user_id: "alice",
      username: "Alice",
      role_type: "user",
      group_ids: ["company"],
      is_enabled: false,
    });
    input.group_ids.push("engineering");
    expect(row.group_ids).toEqual(["company"]);
  });
});

it("keeps bounded skill lookup lists as repeated query parameters", () => {
  expect(
    apiUrl("/manager/skills", { runtime_names: ["one", "two"], limit: 100 }),
  ).toBe("/api/manager/skills?runtime_names=one&runtime_names=two&limit=100");
});
