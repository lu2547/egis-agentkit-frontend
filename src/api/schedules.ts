import { http, json } from "./http";

export type ScheduleKind =
  "once" | "interval" | "daily" | "weekly" | "biweekly" | "monthly" | "yearly";

export interface ScheduleRule {
  kind: ScheduleKind;
  time?: string;
  date?: string;
  weekdays?: number[];
  day?: number;
  month?: number;
  interval_seconds?: number;
}

export interface ScheduleForm {
  name: string;
  description: string;
  project_id: string;
  model_key?: string | null;
  permission_mode: "dont_ask" | "explore";
  timezone: string;
  enabled: boolean;
  stateful?: boolean;
  files?: string[];
  starts_on?: string | null;
  ends_on?: string | null;
  rule: ScheduleRule;
}

export interface Schedule extends ScheduleForm {
  id: string;
  user_id: string;
  agent_id: string;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export type RunStatus = "queued" | "running" | "succeeded" | "failed";

export interface ScheduleRun {
  id: string;
  schedule_id: string;
  schedule_name: string;
  project_id: string;
  trigger_type: "scheduled" | "backfill" | "test";
  status: RunStatus;
  scheduled_for?: string | null;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  session_id?: string | null;
  reply_id?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  archived_at?: string | null;
  summary?: string | null;
}

const schedulePath = (id: string) =>
  `/manager/schedules/${encodeURIComponent(id)}`;
const runPath = (id: string) =>
  `/manager/schedule-runs/${encodeURIComponent(id)}`;

export const scheduleApi = {
  list: () => http<{ items: Schedule[] }>("/manager/schedules"),
  create: (body: ScheduleForm) =>
    http<Schedule>("/manager/schedules", json("POST", body)),
  update: (id: string, body: ScheduleForm | { enabled: boolean }) =>
    http<Schedule>(schedulePath(id), json("PATCH", body)),
  preview: (
    body: Pick<
      ScheduleForm,
      "timezone" | "enabled" | "rule" | "starts_on" | "ends_on"
    >,
    signal: AbortSignal,
  ) =>
    http<{ next_run_at: string | null }>("/manager/schedules/preview", {
      ...json("POST", body),
      signal,
    }),
  removeBatch: (ids: string[]) =>
    http<void>("/manager/schedules/batch-delete", json("POST", { ids })),
  run: (id: string) =>
    http<ScheduleRun>(`${schedulePath(id)}/run`, { method: "POST" }),
  runs: (
    query: {
      schedule_id?: string;
      status?: RunStatus;
      q?: string;
      archived?: string;
    },
    signal?: AbortSignal,
  ) =>
    http<{ items: ScheduleRun[] }>("/manager/schedule-runs", { signal }, query),
  archive: (id: string, archived: boolean) =>
    http<ScheduleRun>(runPath(id), json("PATCH", { archived })),
  removeRun: (id: string) => http<void>(runPath(id), { method: "DELETE" }),
};
