import type {
  RunStatus,
  ScheduleForm,
  ScheduleKind,
  ScheduleRule,
  ScheduleRun,
} from "../api/schedules";

export const scheduleTimezone = "Asia/Shanghai";
export const weekdays = ["一", "二", "三", "四", "五", "六", "日"];
export const scheduleKinds: Record<ScheduleKind, string> = {
  interval: "固定间隔",
  once: "单次",
  daily: "每天",
  weekly: "每周",
  biweekly: "每双周",
  monthly: "每月",
  yearly: "每年",
};
export const intervalUnits = [
  { seconds: 60, label: "分钟" },
  { seconds: 3600, label: "小时" },
  { seconds: 86400, label: "天" },
];
export const runStatuses: Record<RunStatus, string> = {
  queued: "排队中",
  running: "运行中",
  succeeded: "成功",
  failed: "失败",
};
const triggers = { scheduled: "定时", backfill: "补跑", test: "测试运行" };
const localDate = new Intl.DateTimeFormat("sv-SE", {
  timeZone: scheduleTimezone,
  dateStyle: "short",
});
const localDateTime = new Intl.DateTimeFormat("sv-SE", {
  timeZone: scheduleTimezone,
  dateStyle: "short",
  timeStyle: "short",
});

export function runLabel(run: ScheduleRun) {
  return `${triggers[run.trigger_type]}${runStatuses[run.status]}`;
}

export function duration(run: ScheduleRun, now: number) {
  if (!run.started_at) return "—";
  const elapsed = Math.max(
    0,
    Math.floor(
      ((run.finished_at ? Date.parse(run.finished_at) : now) -
        Date.parse(run.started_at)) /
        1000,
    ),
  );
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  return `${hours ? `${hours} 小时 ` : ""}${minutes ? `${minutes} 分 ` : ""}${elapsed % 60} 秒`;
}

export function dateTime(value?: string | null, timeZone = scheduleTimezone) {
  if (!value) return "—";
  const formatter =
    timeZone === scheduleTimezone
      ? localDateTime
      : new Intl.DateTimeFormat("sv-SE", {
          timeZone,
          dateStyle: "short",
          timeStyle: "short",
        });
  return formatter.format(new Date(value));
}

export function nextRunLabel(schedule: {
  enabled: boolean;
  next_run_at: string | null;
  timezone: string;
}) {
  if (!schedule.enabled) return "任务已暂停";
  return schedule.next_run_at
    ? `下次运行 ${dateTime(schedule.next_run_at, schedule.timezone)}`
    : "无后续运行";
}

export function intervalParts(seconds: number) {
  const unit = [...intervalUnits]
    .reverse()
    .find((entry) => Number.isInteger(seconds / entry.seconds)) ?? {
    seconds: 1,
    label: "秒",
  };
  return { unit, amount: seconds / unit.seconds };
}

export function ruleLabel(rule: ScheduleRule) {
  const time = rule.time ?? "";
  switch (rule.kind) {
    case "once":
      return `${rule.date || "请选择日期"} ${time}（单次）`;
    case "interval": {
      const { unit, amount } = intervalParts(rule.interval_seconds ?? 3600);
      return `每隔 ${amount} ${unit.label}`;
    }
    case "weekly":
    case "biweekly":
      return `${scheduleKinds[rule.kind]} ${rule.weekdays?.map((day) => `周${weekdays[day]}`).join("、") ?? ""} ${time}`;
    case "monthly":
      return `每月 ${rule.day || "—"} 日 ${time}`;
    case "yearly":
      return `每年 ${rule.month || "—"} 月 ${rule.day || "—"} 日 ${time}`;
    default:
      return `每天 ${time}`;
  }
}

export function defaultRule(kind: ScheduleKind, time = "09:00"): ScheduleRule {
  const date = localDate.format(new Date());
  switch (kind) {
    case "once":
      return { kind, time, date: localDate.format(Date.now() + 86400000) };
    case "interval":
      return { kind, time, date, interval_seconds: 3600 };
    case "biweekly":
      return { kind, time, date, weekdays: [0] };
    case "weekly":
      return { kind, time, weekdays: [0] };
    case "monthly":
      return { kind, time, day: 1 };
    case "yearly":
      return { kind, time, day: 1, month: 1 };
    default:
      return { kind, time };
  }
}

export function newSchedule(): ScheduleForm {
  return {
    name: "",
    description: "",
    project_id: "",
    model_key: null,
    enabled: true,
    permission_mode: "dont_ask",
    timezone: scheduleTimezone,
    files: [],
    rule: defaultRule("daily"),
  };
}

export const scheduleTemplates: {
  name: string;
  description: string;
  rule: ScheduleRule;
}[] = [
  {
    name: "每日运营动态",
    description: "汇总当天的运营事项、风险和待跟进问题。",
    rule: { kind: "daily", time: "09:00" },
  },
  {
    name: "每周项目周报",
    description:
      "汇总项目本周进展、风险和下周行动，生成项目周报并保存到项目产物。",
    rule: { kind: "weekly", time: "17:00", weekdays: [4] },
  },
  {
    name: "月末材料检查",
    description: "核对本月材料清单，列出缺失文件并生成检查结果。",
    rule: { kind: "monthly", time: "16:30", day: 28 },
  },
  {
    name: "会前准备",
    description: "整理会议议程、已有材料和需要确认的问题。",
    rule: defaultRule("once", "08:45"),
  },
  {
    name: "项目资料归档提醒",
    description: "列出项目里待归档的文件，并在工作台提醒。",
    rule: { kind: "weekly", time: "15:00", weekdays: [2] },
  },
  {
    name: "交付进度检查",
    description: "检查计划和产物，标记延期和待补事项。",
    rule: { ...defaultRule("biweekly", "10:00"), weekdays: [0] },
  },
];

export function runConversation(run: ScheduleRun) {
  return {
    path: `/tasks/${encodeURIComponent(run.session_id ?? "")}`,
    query: run.reply_id ? { reply_id: run.reply_id } : {},
  };
}
