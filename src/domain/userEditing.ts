import type { User } from "../types/api";

/** User rows include audit fields; writes contain editable identity fields only. */
export function userWriteInput(user: User): User {
  return {
    user_id: user.user_id,
    username: user.username,
    role_type: user.role_type,
    group_ids: [...user.group_ids],
    is_enabled: user.is_enabled,
  };
}
