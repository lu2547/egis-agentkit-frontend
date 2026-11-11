import type { ReplyArtifact } from "../types/api";

/** Native reply_id is the assistant Msg.id; never infer from message position. */
export function groupReplyArtifacts(files: ReplyArtifact[]) {
  const result: Record<string, ReplyArtifact[]> = Object.create(null);
  for (const file of files) {
    if (file.is_directory) continue;
    (result[file.reply_id] ||= []).push(file);
  }
  return result;
}
