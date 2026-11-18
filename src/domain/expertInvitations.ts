import { definitionName, definitionRef } from "../types/api";
import type { Collaborator, Definition, DefinitionRef } from "../types/api";

export function isInvitableExpert(definition: Definition): boolean {
  return (
    definition.is_usable &&
    definition.definition_type === "agent" &&
    (definition.agent_type === "expert" || definition.agent_type === "remote")
  );
}

export function sameExpert(a: DefinitionRef, b: DefinitionRef): boolean {
  return (
    a.definition_id === b.definition_id &&
    a.resource_view_type === b.resource_view_type
  );
}

export function expertInvitation(definition: Definition): Collaborator {
  return {
    ...definitionRef(definition),
    display_name: definitionName(definition),
    status: "pending",
    avatar: definition.payload.avatar,
  };
}

export function invitationRef(member: Collaborator): DefinitionRef {
  return {
    definition_id: member.definition_id,
    resource_view_type: member.resource_view_type,
    resource_version: member.resource_version,
  };
}
