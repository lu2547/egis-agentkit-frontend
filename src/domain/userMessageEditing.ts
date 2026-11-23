import { UserMsg, type Msg } from "@agentscope-ai/agentscope/message";
import {
  getMessageProjectFiles,
  getMessageReferences,
} from "./previewReferences";
import { getTextAnnotations } from "./textAnnotations";

export function userMessageText(message: Msg): string {
  for (const key of ["annotation_prompt", "preview_prompt"]) {
    const prompt = message.metadata?.[key];
    if (typeof prompt === "string") return prompt;
  }
  return message.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("\n\n");
}

export function canSendUserMessage(message: Msg, text: string): boolean {
  return (
    !!text.trim() ||
    message.content.some((block) => block.type === "data") ||
    !!getMessageProjectFiles(message).length ||
    !!getMessageReferences(message).length ||
    !!getTextAnnotations(message).length
  );
}

/** Retain the native message and its injected context; only the visible prompt changes. */
export function editedUserMessage(message: Msg, text: string): Msg {
  const next = JSON.parse(JSON.stringify(message)) as Msg;
  const prompt = userMessageText(message);
  const annotated = ["annotation_prompt", "preview_prompt"].some(
    (key) => typeof message.metadata?.[key] === "string",
  );
  const first = next.content.find((block) => block.type === "text");
  if (first?.type === "text") {
    const suffix =
      annotated && first.text.startsWith(prompt)
        ? first.text.slice(prompt.length)
        : "";
    first.text =
      text +
      (text && suffix && !suffix.startsWith("\n") ? "\n\n" : "") +
      suffix;
    if (!annotated)
      next.content = next.content.filter(
        (block) => block.type !== "text" || block === first,
      );
  } else if (text) {
    next.content.unshift(
      UserMsg({ name: next.name, content: text }).content[0]!,
    );
  }
  for (const key of ["annotation_prompt", "preview_prompt"]) {
    if (typeof next.metadata?.[key] === "string") next.metadata[key] = text;
  }
  delete next.metadata.agentkit_delivery;
  next.created_at = new Date().toISOString();
  if (next.finished_at) next.finished_at = next.created_at;
  return next;
}
