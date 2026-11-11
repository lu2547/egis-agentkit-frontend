import { describe, expect, it } from 'vitest';
import type { Msg } from '@agentscope-ai/agentscope/message';
import { workspacePlan } from '../src/domain/workspacePlan';

const message = (content: unknown[]) => ({ role: 'assistant', content }) as Msg;
const call = (id: string, name: string, input: object) => ({ type: 'tool_call', id, name, input: JSON.stringify(input) });
const result = (id: string, output: string, state = 'success') => ({ type: 'tool_result', id, output, state });
describe('workspace plan', () => {
  it('reconstructs successful native task creation and updates', () => {
    expect(workspacePlan([message([
      call('a', 'TaskCreate', { subject: 'Inspect files' }), result('a', 'Task (id=1) created successfully: Inspect files'),
      call('b', 'TaskUpdate', { task_id: '1', status: 'completed' }), result('b', 'Update task (id=1) status.'),
    ])])).toEqual([{ id: '1', subject: 'Inspect files', status: 'completed' }]);
  });
  it('ignores prose and failed operations and reads native task lists', () => {
    expect(workspacePlan([message([
      { type: 'text', text: 'Plan: invent a task' },
      call('a', 'TaskCreate', { subject: 'Failed' }), result('a', 'Task (id=1) created successfully: Failed', 'error'),
      call('b', 'TaskList', {}), result('b', '2 [in_progress] Real work'),
    ])])).toEqual([{ id: '2', subject: 'Real work', status: 'in_progress' }]);
  });
});

it('reads Python native task output and updates canonical tasks', () => {
  expect(workspacePlan([message([
    call('a', 'TaskCreate', { subject: 'Second' }), result('a', 'Task (id=2) created successfully: Second'),
    call('b', 'TaskUpdate', { task_id: '1', status: 'completed' }), result('b', 'Update task (id=1) status.'),
  ])], [{ id: '1', subject: 'Existing', status: 'pending' }])).toEqual([
    { id: '1', subject: 'Existing', status: 'completed' }, { id: '2', subject: 'Second', status: 'pending' },
  ]);
});
