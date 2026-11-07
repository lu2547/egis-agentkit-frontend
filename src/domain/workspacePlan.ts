import type { Msg } from '@agentscope-ai/agentscope/message';

export interface PlanItem { id: string; subject: string; status: string }
/** Reconstruct only successful native task-tool operations, never ordinary prose. */
export function workspacePlan(messages: Msg[], initial: PlanItem[] = []): PlanItem[] {
  const tasks = new Map(initial.map(item => [item.id, { ...item }]));
  for (const message of messages) {
    const calls = new Map(message.content.filter(b => b.type === 'tool_call').map(b => [b.id, b]));
    for (const block of message.content) {
      if (block.type !== 'tool_result' || block.state !== 'success') continue;
      const call = calls.get(block.id);
      if (!call) continue;
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(call.input); } catch { continue; }
      const output = typeof block.output === 'string' ? block.output : block.output.map(b => b.type === 'text' ? b.text : '').join('\n');
      if (call.name === 'TaskCreate' && typeof input.subject === 'string') {
        const id = output.match(/Task (?:\(id=([^\)]+)\)|(\S+)) created successfully/)?.slice(1).find(Boolean);
        if (id) tasks.set(id, { id, subject: input.subject, status: 'pending' });
      } else if (call.name === 'TaskUpdate' && typeof (input.task_id ?? input.taskId) === 'string') {
        const taskId = (input.task_id ?? input.taskId) as string;
        const item = tasks.get(taskId);
        if (!item) continue;
        if (input.status === 'deleted') tasks.delete(taskId);
        else tasks.set(taskId, { ...item, subject: typeof input.subject === 'string' ? input.subject : item.subject, status: typeof input.status === 'string' ? input.status : item.status });
      } else if (call.name === 'TaskList') {
        for (const line of output.split('\n')) {
          const match = line.match(/^(\S+) \[(pending|in_progress|completed)\] (.+)$/);
          if (match) tasks.set(match[1], { id: match[1], status: match[2], subject: match[3] });
        }
      }
    }
  }
  return [...tasks.values()];
}
