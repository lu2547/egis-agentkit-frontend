// Deterministic HTTP fixtures used only by Playwright, never imported by production.
import { createServer } from "node:http";
const date = "2026-11-03T01:00:00Z";
const descriptions = [
  "将零散资料整理成清晰结论，形成可追溯的研究报告。",
  "梳理客户反馈与行业信息，找到产品迭代的方向。",
  "把复杂信息写得清楚，协助你完成方案、邮件与文案。",
  "理解业务指标，整理数据洞察与决策建议。",
  "从业务目标到技术实现，协助评估方案与代码。",
  "整理会议记录，提取行动项，推动项目有序进行。",
];
const names = [
  "研究分析专家",
  "产品策略顾问",
  "写作与表达专家",
  "数据分析专家",
  "研发协作专家",
  "项目协作伙伴",
];
const definitions = names.map((name, i) => ({
  id: `expert-${i}`,
  agent_name: `expert_${i}`,
  agent_display_name: name,
  definition_type: "agent",
  agent_type: "expert",
  owner_type: i === 2 ? "user" : "system",
  owner_id: i === 2 ? "demo" : "system",
  payload: {
    description: descriptions[i],
    category: [
      "研究分析",
      "产品设计",
      "内容创作",
      "数据分析",
      "软件研发",
      "办公协同",
    ][i],
    tags: [
      ["资料检索", "研究报告"],
      ["需求分析", "产品策略"],
      ["文档写作", "表达优化"],
      ["数据洞察", "指标分析"],
      ["代码评审", "技术方案"],
      ["会议纪要", "任务管理"],
    ][i],
    starter_prompts: ["帮我整理一份行业研究报告", "把这段内容整理成行动计划"],
    system_prompt: "认真可靠",
    bindings: [],
    avatar: "spark",
  },
  resource_view_type: i === 2 ? "private" : "system",
  is_usable: true,
  is_editable: i === 2,
  is_deletable: i === 2,
  can_share_update: i === 2,
  owner_version: i === 2 ? 3 : 1,
  version: i === 2 ? 3 : 1,
  resource_version: i === 2 ? "3" : "1",
  version_label: i === 2 ? "1.2" : "1.0",
}));
const assistant = {
  ...definitions[0],
  id: "personal",
  agent_type: "personal",
  agent_display_name: "个人助理",
  owner_type: "user",
  owner_id: "demo",
  resource_view_type: "private",
};
const team = {
  ...definitions[0],
  id: "team-1",
  owner_type: "user",
  owner_id: "demo",
  resource_view_type: "private",
  is_editable: true,
  definition_type: "team",
  owner_version: 2,
  version: 2,
  resource_version: "2",
  agent_type: null,
  agent_name: null,
  agent_display_name: null,
  team_name: "research_team",
  team_display_name: "研究与策略专家团",
  payload: {
    ...definitions[0].payload,
    orchestrator: { definition_id: "lead", resource_view_type: "system", resource_version: "2" },
    members: [
      { definition_id: "expert-0", resource_view_type: "system", resource_version: "1" },
      { definition_id: "expert-1", resource_view_type: "system", resource_version: "1" },
    ],
  },
};
const resources = [
  {
    resource_id: "research",
    resource_version: "1.0.0",
    owner_type: "system",
    owner_id: "system",
    owner_display_name: "系统",
    display_name: "研究方法",
    description: "让复杂问题的调研更有条理。",
    is_usable: true,
    is_editable: false,
    is_installed: false,
    is_enabled: false,
    resource_view_type: "system",
    payload: { markdown: "# 研究方法\n\n先确定问题，再收集资料并核对来源。" },
  },
  {
    resource_id: "writing",
    resource_version: "1.0.0",
    version_label: "1.0",
    owner_type: "user",
    owner_id: "demo",
    display_name: "报告写作",
    description: "遵循团队的写作规范，输出清晰文档。",
    is_usable: true,
    is_editable: true,
    is_installed: true,
    is_enabled: true,
    resource_view_type: "private",
    can_share: true,
    payload: {
      category: "内容创作",
      avatar: "skill:ppt",
      files: [{ path: "references/style.md", size: 128 }, { path: "scripts/check.py", size: 256 }],
      base_version: "1.0.0",
      markdown:
        '---\nname: 报告写作\ndescription: 遵循团队的写作规范，输出清晰文档。\nversion: 1.0.0\n---\n\n# 报告写作\n\n<script>window.badMarkdown=true</script><img src=x onerror="window.badMarkdown=true">\n\n[危险](javascript:alert(1))\n\n## 结构\n\n- 摘要\n- 分析\n- 建议',
    },
  },
  {
    resource_id: "shared-notes",
    resource_version: "1.0.0",
    owner_type: "user",
    owner_id: "publisher",
    owner_display_name: "李晓",
    display_name: "会议纪要",
    description: "记录会议讨论和行动项。",
    is_usable: true,
    is_editable: false,
    is_installed: false,
    is_enabled: false,
    resource_view_type: "shared",
    payload: { markdown: "# 会议纪要\n\n记录会议讨论和行动项。" },
  },
];
function catalogFixture(items, url, { name, category, mine, facets = {} }) {
  const query = (url.searchParams.get("query") ?? "").trim().toLowerCase();
  const selectedCategory = url.searchParams.get("category");
  const owned = url.searchParams.get("mine") === "true";
  const offset = Number(url.searchParams.get("cursor") ?? 0);
  const limit = Number(url.searchParams.get("limit") ?? 10);
  const filtered = items.filter((item) =>
    (!query || name(item).toLowerCase().includes(query)) &&
    (!selectedCategory || category?.(item) === selectedCategory) &&
    (!owned || mine?.(item)),
  );
  return {
    items: filtered.slice(offset, offset + limit),
    next_cursor: offset + limit < filtered.length ? String(offset + limit) : null,
    ...(offset === 0 ? facets : {}),
  };
}
const files = [
  {
    name: "研究简报.html",
    path: "研究简报 & plan.html",
    is_directory: false,
    size: 2379,
    modified_at: date,
  },
  {
    name: "行动计划.md",
    path: "行动计划.md",
    is_directory: false,
    size: 640,
    modified_at: date,
  },
];
let skillResources = structuredClone(resources), skillImports = [], skillImportSequence = 1;
let role = "admin",
  tasks = [],
  projects = [],
  taskSequence = 1,
  projectSequence = 1,
  projectChanges = {},
  fileContents = {},
  deliveries = {},
  messages = {},
  replyFeedback = [],
  streams = new Map(),
  uploads = {};
function reset() {
  skillResources = structuredClone(resources);
  skillImports = [];
  skillImportSequence = 1;
  uploads = {};
  projectChanges = {};
  fileContents = {};
  taskSequence = 1;
  projectSequence = 1;
  projects = [
    {
      id: "project-1",
      project_name: "行业研究",
      owner_id: "demo",
      created_at: date,
      updated_at: date,
    },
  ];
  role = "admin";
  tasks = [
    {
      session_id: "s1",
      project_id: "project-1",
      plan: [],
      agent_id: "a1",
      name: "整理行业研究与行动建议",
      definition_id: "expert-0",
      definition_display_name: "研究分析专家",
      permission_mode: "default",
      model_key: "test",
      updated_at: date,
    },
  ];
  messages = { s1: [] };
  replyFeedback = [];
  deliveries = {};
}
reset();
const replyEvents = (sid, replyId, confirmed = false) => {
  // This fixture creates deliveries only on the first completed reply.
  if (!deliveries[sid]) deliveries[sid] = files.map(file => ({ ...file, area: "artifacts", reply_id: replyId }));
  const list = [
    {
      type: "REPLY_START",
      session_id: sid,
      reply_id: replyId,
      name: "研究分析专家",
      role: "assistant",
    },
  ];
  if (!confirmed)
    list.push(
      {
        type: "HINT_BLOCK",
        hint: "<system-reminder>internal timestamp</system-reminder>",
      },
      { type: "HINT_BLOCK", hint: "正在整理资料" },
      { type: "THINKING_BLOCK_START", block_id: "thinking" },
      {
        type: "THINKING_BLOCK_DELTA",
        block_id: "thinking",
        delta: "先整理目标与信息来源，再检查关键事实。",
      },
      { type: "THINKING_BLOCK_END", block_id: "thinking" },
      {
        type: "TOOL_CALL_START",
        tool_call_id: "tool1",
        tool_call_name: "检索工作资料",
      },
      {
        type: "TOOL_CALL_DELTA",
        tool_call_id: "tool1",
        delta: '{"query":"行业研究"}',
      },
      { type: "TOOL_CALL_END", tool_call_id: "tool1" },
    );
  list.push(
    {
      type: "TOOL_RESULT_START",
      tool_call_id: "tool1",
      tool_call_name: "检索工作资料",
    },
    {
      type: "TOOL_RESULT_TEXT_DELTA",
      tool_call_id: "tool1",
      delta: "已完成资料整理。",
    },
    { type: "TOOL_RESULT_END", tool_call_id: "tool1", state: "success" },
    { type: "TEXT_BLOCK_START", block_id: "answer" },
    {
      type: "TEXT_BLOCK_DELTA",
      block_id: "answer",
      delta:
        "## 已完成研究简报\n\n根据当前资料，建议先明确目标用户与核心问题，再推进验证。\n\n- **优先事项**：补齐关键证据与行业数据\n- **下一步**：确认负责人、时间与验收标准\n\n交付文件已保存在右侧工作空间。",
    },
    { type: "TEXT_BLOCK_END", block_id: "answer" },
    { type: "REPLY_END", session_id: sid, finished_reason: "completed" },
  );
  return list.map((e, i) => ({
    id: crypto.randomUUID(),
    created_at: new Date(Date.now() + i).toISOString(),
    reply_id: replyId,
    ...e,
  }));
};
function emit(sid, event) {
  for (const stream of streams.get(sid) || [])
    stream.write(`data: ${JSON.stringify(event)}\n\n`);
}
function json(res, value, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value));
}
async function body(req) {
  let result = "";
  for await (const chunk of req) result += chunk;
  return result ? JSON.parse(result) : {};
}
createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = decodeURIComponent(url.pathname);
  if (p === "/__test/health") return json(res, { ok: true });
  if (p === "/__test/reset") {
    reset();
    return json(res, {});
  }
  if(p === '/__test/messages' && req.method === 'POST') {
    const input=await body(req); messages[input.session_id]=input.messages;
    return json(res,{});
  }
  if (p === "/__test/events" && req.method === "POST") {
    const input = await body(req);
    const task = tasks.find((item) => item.session_id === input.session_id);
    if (!task?.activeReply)
      return json(res, { detail: "No active fixture reply" }, 409);
    if (input.events.some((event) => event.type === "REPLY_END"))
      task.is_running = false;
    for (const event of input.events)
      emit(input.session_id, {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        session_id: input.session_id,
        reply_id: task.activeReply,
        ...event,
      });
    return json(res, {});
  }
  if (p === "/auth/login") {
    const input = await body(req);
    role = input.user_id === "user" ? "user" : "admin";
    return json(res, { access_token: "test-only" });
  }
  if (!req.headers.authorization) return json(res, { detail: "请登录" }, 401);
  if (p === "/manager/me")
    return json(res, {
      user_id: "demo",
      username: "Frankie",
      role_type: role,
      group_ids: ["design"],
      is_enabled: true,
    });
  if (p === "/manager/assistant") return json(res, assistant);
  if (p === "/manager/models")
    return json(res, {
      items: [
        { key: "test", display_name: "工作模型" },
        { key: "test-alt", display_name: "快速模型" },
      ],
      default_key: "test",
    });
  if (/^\/manager\/projects\/[^/]+\/preview-options$/.test(p))
    return json(res, {maxCount:4,maxTotalBytes:1048576,maxImageBytes:262144,maxImagePixels:1500000,maxImageEdge:1600,maxRegions:8,minRegionPixels:5,maxExcerptChars:8000,maxNoteChars:500,captureTimeoutMs:15000,jpegQuality:0.85,jpegMinQuality:0.25,jpegQualityStep:0.15});
  if (/^\/manager\/projects\/[^/]+\/workbook-options$/.test(p))
    return json(res, {maxBytes: 20971520, maxReferenceCells: 2000, maxEntries:1000, maxEntryBytes:20971520, maxExpandedBytes:52428800});
  if (/^\/manager\/projects\/[^/]+\/presentation-options$/.test(p))
    return json(res, {maxSlides:200,thumbnailWidth:144,maxThumbnailPixels:65536,thumbnailConcurrency:2});
  if (/^\/manager\/projects\/[^/]+\/presentation$/.test(p))
    return json(res, {checksum:url.searchParams.get('checksum') || 'a'.repeat(64),slides:[{id:'256',title:'Preview slide 1'},{id:'257',title:'Preview slide 2'}],options:{maxSlides:200,thumbnailWidth:144,maxThumbnailPixels:65536,thumbnailConcurrency:2}});
  if (p === "/manager/runtime-options")
    return json(res, {
      permission_modes: [
        {
          value: "default",
          label: "Default",
          description: "按规则请求操作权限",
          is_enabled: true,
        },
        {
          value: "accept_edits",
          label: "Accept Edits",
          description: "自动允许工作目录内的文件操作",
          is_enabled: true,
        },
        {
          value: "explore",
          label: "Explore",
          description: "只读探索，拒绝修改",
          is_enabled: true,
        },
        {
          value: "bypass",
          label: "Bypass",
          description: "跳过大部分工具权限检查",
          is_enabled: true,
        },
      ],
      default_permission_mode: "bypass",
      steering: {max_batch_size: 20, max_message_bytes: 1048576, max_text_length: 32000},
    });
  if (p === "/manager/composer/options") {
    const category = url.searchParams.get("category"),
      query = (url.searchParams.get("query") || "").toLocaleLowerCase(),
      sid = url.searchParams.get("session_id"),
      task = tasks.find((item) => item.session_id === sid),
      pid = task?.project_id || url.searchParams.get("project_id"),
      limit = Math.min(10, Math.max(1, Number(url.searchParams.get("limit") || 10))),
      offset = Number(url.searchParams.get("cursor") || 0);
    let options = [];
    if (category === "experts" && (!sid || task?.definition_id === "personal"))
      options = definitions.filter((definition) => definition.is_usable && definition.agent_type === "expert").map((definition) => ({
        id: definition.id, name: definition.agent_display_name,
        detail: definition.payload.description, kind: "expert", definition,
      }));
    if (category === "skills" && (!sid || task?.definition_id === "personal"))
      options = skillResources.filter((skill) => skill.is_usable && skill.is_installed && skill.is_enabled).map((skill) => ({
        id: `${skill.resource_id}@${skill.resource_version}`, name: skill.display_name,
        detail: skill.description, kind: "skill", insert_text: `请使用${skill.display_name}技能 `,
      }));
    if (category === "context" && pid)
      options = [
        ...(uploads[pid] || []).map((file) => ({ ...file, area: "uploads" })),
        ...(pid === "project-1" ? files.map((file) => ({ ...file, area: "artifacts" })) : []),
      ].filter((file) => !file.is_directory).map((file) => ({
        id: `file:${file.area}:${file.path}`, name: file.name,
        detail: file.area === "artifacts" ? `artifacts/${file.path}` : file.path,
        kind: "file", reference: file.area === "artifacts" ? `artifacts/${file.path}` : file.path,
      }));
    const matching = options.filter((item) => `${item.name} ${item.detail}`.toLocaleLowerCase().includes(query));
    return json(res, {
      items: matching.slice(offset, offset + limit),
      next_cursor: offset + limit < matching.length ? String(offset + limit) : null,
    });
  }
  if (p === "/manager/agents" && req.method === "GET") {
    if (url.searchParams.get("catalog") === "true") {
      return json(res, catalogFixture(definitions, url, {
        name: (definition) => `${definition.agent_display_name} ${definition.payload.description} ${definition.payload.tags.join(" ")}`,
        category: (definition) => definition.payload.category,
        mine: (definition) => definition.owner_type === "user" && definition.owner_id === "demo",
        facets: { categories: [...new Set(definitions.map((item) => item.payload.category))] },
      }));
    }
    const types = url.searchParams.getAll("type");
    const matching = types.length
      ? definitions.filter((definition) => types.includes(definition.agent_type))
      : definitions;
    const offset = Number(url.searchParams.get("cursor") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 50);
    return json(res, {
      items: matching.slice(offset, offset + limit),
      next_cursor: offset + limit < matching.length ? String(offset + limit) : null,
    });
  }
  if (p.endsWith("/versions") && req.method === "GET") {
    const definition = [...definitions, team].find((row) =>
      p === `/manager/${row.definition_type === "team" ? "teams" : "agents"}/${row.id}/versions`,
    );
    if (definition) return json(res, { items: [{
      resource_version: definition.resource_version,
      resource_view_type: definition.resource_view_type,
    }] });
  }
  if (p.startsWith("/manager/agents/") && req.method === "GET") {
    const definition = definitions.find((row) => p === `/manager/agents/${row.id}`);
    if (definition) return json(res, definition);
  }
  if (p === "/manager/teams/team-1")
    return json(res, {
      ...team,
      orchestrator_config: {
        agent_name: "research_leader",
        agent_display_name: "研究主理人",
        owner_version: 2,
        payload: {
          ...assistant.payload,
          system_prompt: "先分配研究任务，再汇总结论。",
        },
      },
    });
  if (p === "/manager/teams") return json(res, { items: [team] });
  if (p === "/manager/projects" && req.method === "GET")
    return json(res, { items: projects });
  if (p === "/manager/projects" && req.method === "POST") {
    const input = await body(req);
    const project = {
      id: `project-${++projectSequence}`,
      project_name: input.project_name,
      owner_id: "demo",
      created_at: date,
      updated_at: date,
    };
    projects.unshift(project);
    return json(res, project, 201);
  }
  if (/^\/manager\/projects\/[^/]+$/.test(p)) {
    const projectId = p.split("/")[3],
      project = projects.find((item) => item.id === projectId);
    if (!project) return json(res, { detail: "未找到项目" }, 404);
    if (req.method === "PATCH") {
      Object.assign(project, await body(req));
      return json(res, project);
    }
    if (req.method === "DELETE") {
      if (
        tasks.some((task) => task.project_id === projectId && task.is_running)
      )
        return json(
          res,
          { detail: "项目中有正在运行的对话，请先停止任务" },
          409,
        );
      projects = projects.filter((item) => item.id !== projectId);
      const sessionIds = tasks
        .filter((task) => task.project_id === projectId)
        .map((task) => task.session_id);
      tasks = tasks.filter((task) => task.project_id !== projectId);
      sessionIds.forEach((sid) => {
        delete messages[sid];
        streams.get(sid)?.forEach((stream) => stream.end());
        streams.delete(sid);
      });
      delete uploads[projectId];
      delete projectChanges[projectId];
      Object.keys(fileContents)
        .filter((key) => key.startsWith(`${projectId}:`))
        .forEach((key) => delete fileContents[key]);
      res.writeHead(204);
      return res.end();
    }
    return json(res, project);
  }
  if (p === "/manager/tasks" && req.method === "GET")
    return json(res, { items: tasks });
  if(/^\/manager\/tasks\/[^/]+\/reply-feedback$/.test(p) && req.method==='GET') {
    const sid=p.split('/')[3];
    return json(res,{items:replyFeedback.filter(f=>f.session_id===sid).map(({reply_id,comment})=>({reply_id,comment}))});
  }
  if (/^\/manager\/tasks\/[^/]+\/replies\/[^/]+\/feedback$/.test(p) && req.method==='PUT') {
    const [, , , sid, , replyId] = p.split('/');
    const task=tasks.find(t=>t.session_id===sid), history=messages[sid] || [];
    const index=history.findIndex(m=>m.id===replyId), reply=history[index];
    if(!task || !reply) return json(res,{detail:'回复不存在'},404);
    const input=await body(req), question=history.slice(0,index).findLast(m=>m.role==='user');
    const text=m=>(m?.content || []).filter(b=>b.type==='text').map(b=>b.text).join('\n');
    let row=replyFeedback.find(f=>f.session_id===sid && f.reply_id===replyId);
    if(row) row.comment=input.comment;
    else {row={id:crypto.randomUUID(),user_id:'demo',username:'Frankie',project_id:task.project_id,project_name:projects.find(p=>p.id===task.project_id)?.project_name,session_id:sid,session_name:task.name,reply_id:replyId,agent_id:task.agent_id,definition_id:task.definition_id,agent_display_name:task.definition_display_name,comment:input.comment,question_text:text(question),reply_text:text(reply),created_at:new Date().toISOString(),updated_at:new Date().toISOString()};replyFeedback.unshift(row);}
    return json(res,row);
  }
  if(/^\/manager\/tasks\/[^/]+\/replies\/[^/]+\/branch$/.test(p) && req.method==='POST') {
    const [, , , sid, , replyId] = p.split('/');
    const source=tasks.find(t=>t.session_id===sid), history=messages[sid] || [];
    const index=history.findIndex(m=>m.id===replyId);
    if(!source || index<0) return json(res,{detail:'回复不存在'},404);
    const task={...source,session_id:`s${++taskSequence}`,name:source.name+' · 分支'};
    tasks.unshift(task);messages[task.session_id]=structuredClone(history.slice(0,index+1));
    return json(res,task,201);
  }
  if (p === "/manager/tasks" && req.method === "POST") {
    const input = await body(req);
    const task = {
      session_id: `s${++taskSequence}`,
      project_id: input.project_id || projects[0]?.id,
      plan: [],
      agent_id: "a1",
      name: "新的工作任务",
      definition_id: input.definition_id,
      resource_version: input.resource_version,
      permission_mode: input.permission_mode || "bypass",
      model_key: input.model_key || "test",
      definition_display_name: input.definition_id === assistant.id
        ? assistant.agent_display_name : "研究分析专家",
      collaboration_allowed: input.definition_id === assistant.id,
      collaborators: [],
      updated_at: date,
    };
    if (
      !task.project_id ||
      !projects.some((project) => project.id === task.project_id)
    )
      return json(res, { detail: "未找到项目" }, 404);
    tasks.unshift(task);
    messages[task.session_id] = [];
    return json(res, task);
  }
  if (/^\/manager\/tasks\/[^/]+\/collaborators$/.test(p) && req.method === "POST") {
    const task = tasks.find((item) => item.session_id === p.split("/")[3]);
    if (!task?.collaboration_allowed)
      return json(res, { detail: "仅个人助理对话可以邀请专家" }, 403);
    const { request_id, experts } = await body(req);
    const collaborators = [];
    for (const reference of experts) {
      const expert = definitions.find((definition) =>
        definition.id === reference.definition_id &&
        definition.resource_view_type === reference.resource_view_type &&
        definition.resource_version === reference.resource_version &&
        definition.is_usable,
      );
      if (!expert) return json(res, { detail: "专家不可用" }, 403);
      collaborators.push({
        ...reference,
        display_name: expert.agent_display_name,
        avatar: expert.payload.avatar,
        status: "pending",
      });
    }
    task.collaborators = collaborators;
    task.pending_collaboration_request_id = collaborators.length ? request_id : null;
    return json(res, task);
  }
  if (/^\/manager\/tasks\/[^/]+\/settings$/.test(p) && req.method === "PATCH") {
    const task = tasks.find((t) => t.session_id === p.split("/")[3]);
    if (!task) return json(res, { detail: "未找到对话" }, 404);
    Object.assign(task, await body(req));
    return json(res, task);
  }
  if (/^\/manager\/tasks\/[^/]+\/name$/.test(p) && req.method === "PATCH") {
    const task = tasks.find((item) => item.session_id === p.split("/")[3]);
    if (!task) return json(res, { detail: "未找到对话" }, 404);
    Object.assign(task, await body(req));
    return json(res, task);
  }
  if (/^\/manager\/tasks\/[^/]+$/.test(p)) {
    const sid = p.split("/")[3],
      task = tasks.find((item) => item.session_id === sid);
    if (!task) return json(res, { detail: "未找到对话" }, 404);
    if (req.method === "DELETE") {
      tasks = tasks.filter((item) => item.session_id !== sid);
      delete messages[sid];
      streams.get(sid)?.forEach((stream) => stream.end());
      streams.delete(sid);
      res.writeHead(204);
      return res.end();
    }
    return json(res, task);
  }
  const projectId = p.startsWith("/manager/projects/") ? p.split("/")[3] : null;
  if (
    projectId &&
    !projects.some((project) => project.id === projectId)
  )
    return json(res, { detail: "未找到项目" }, 404);
  if (p.startsWith("/manager/tasks/") && p.endsWith("/artifacts"))
    return json(res, { items: deliveries[p.split("/")[3]] || [] });
  if (projectId && p.endsWith("/files")) {
    const area = url.searchParams.get("area");
    if (req.method === "POST") {
      let bytes = Buffer.alloc(0);
      for await (const chunk of req) bytes = Buffer.concat([bytes, chunk]);
      const name =
        bytes.toString().match(/filename="([^"\r\n]+)"/)?.[1] || "upload.txt";
      const file = {
        name,
        path: name,
        area: "uploads",
        is_directory: false,
        size: bytes.length,
        modified_at: date,
      };
      const boundary =
        req.headers["content-type"]?.match(/boundary=(.+)$/)?.[1];
      const contentStart = bytes.indexOf("\r\n\r\n") + 4;
      const contentEnd = boundary
        ? bytes.indexOf(`\r\n--${boundary}`, contentStart)
        : bytes.length;
      fileContents[`${projectId}:uploads:${name}`] = bytes.subarray(
        contentStart,
        contentEnd,
      );
      const existing = (uploads[projectId] ||= []);
      const previous = existing.find((item) => item.path === name);
      uploads[projectId] = [
        ...existing.filter((item) => item.path !== name),
        file,
      ];
      const changes = (projectChanges[projectId] ||= []);
      changes.unshift({
        change_id: changes.length + 1,
        path: name,
        area: "uploads",
        change_type: previous ? "modified" : "created",
        observed_at: date,
        size: file.size,
        previous_size: previous?.size ?? null,
      });
      return json(res, file, 201);
    }
    return json(res, {
      items:
        area === "uploads"
          ? uploads[projectId] || []
          : area === "work"
            ? []
            : projectId === "project-1"
              ? files
              : [],
      area,
      path: "",
    });
  }
  if (projectId && p.endsWith("/file-changes"))
    return json(res, {
      items: projectChanges[projectId] || [],
      next_cursor: null,
      scan_error: null,
    });
  if (projectId && p.endsWith("/file")) {
    const path = url.searchParams.get("path");
    const content =
      fileContents[`${projectId}:${url.searchParams.get("area")}:${path}`];
    if (content) {
      res.writeHead(200, { "Content-Type": "text/plain" });
      return res.end(content);
    }
    res.writeHead(200, {
      "Content-Type": path?.endsWith(".html") ? "text/html" : "text/markdown",
    });
    return res.end(
      path?.endsWith(".html")
        ? '<html><body style="font-family:sans-serif;padding:25px"><h1>研究简报</h1><p>验证优先，让结论更有依据。</p><script>try { window.parent.previewScriptRan=true } catch { document.body.dataset.parentAccess="blocked" }</script></body></html>'
        : "# 行动计划\n\n- 确定目标\n- 整理证据\n- 验证结论",
    );
  }
  if (p.endsWith("/messages"))
    return json(res, {
      messages: messages[p.split("/")[2]] || [],
      event_cursor: null,
      is_running: false,
      has_more: false,
    });
  if (p.endsWith("/stream")) {
    const sid = p.split("/")[2];
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();
    res.write(": ready\n\n");
    const set = streams.get(sid) || new Set();
    streams.set(sid, set);
    set.add(res);
    req.on("close", () => set.delete(res));
    return;
  }
  if (p === "/chat/") {
    const input = await body(req);
    const sid = input.session_id;
    if (input.delivery === "steer") {
      const inputs = Array.isArray(input.input) ? input.input : [input.input];
      const saved = inputs.map(message => ({...message, metadata:{...message.metadata,agentkit_delivery:{kind:"steer",state:"queued"}}}));
      messages[sid] ||= [];
      for(const message of saved) if(!messages[sid].some(existing=>existing.id===message.id)) messages[sid].push(message);
      emit(sid,{type:"CUSTOM",id:crypto.randomUUID(),created_at:new Date().toISOString(),name:"user_steering",value:{messages:saved}});
      return json(res,{status:"queued",session_id:sid,message_ids:saved.map(message=>message.id)});
    }
    if (input.input?.type === "USER_CONFIRM_RESULT") {
      for (const e of replyEvents(sid, input.input.reply_id, true))
        emit(sid, e);
      return json(res, { status: "accepted" });
    }
    const replyId = crypto.randomUUID();
    const text = input.input?.content?.[0]?.text || "";
    if (text.includes("长任务")) {
      emit(sid, {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        type: "REPLY_START",
        session_id: sid,
        reply_id: replyId,
        name: "研究分析专家",
        role: "assistant",
      });
      messages[sid] = [input.input];
      tasks.find((t) => t.session_id === sid).activeReply = replyId;
      tasks.find((t) => t.session_id === sid).is_running = true;
    } else if (text.includes("测试确认")) {
      for (const e of replyEvents(sid, replyId).slice(0, 7)) emit(sid, e);
      emit(sid, {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        type: "REQUIRE_USER_CONFIRM",
        reply_id: replyId,
        tool_calls: [
          {
            type: "tool_call",
            id: "tool1",
            name: "检索工作资料",
            input: "{}",
            state: "asking",
            created_at: date,
            suggested_rules: text.includes("记住")
              ? [
                  {
                    tool_name: "检索工作资料",
                    rule_content: "研究资料/**",
                    behavior: "allow",
                    source: "suggested",
                  },
                ]
              : [],
          },
        ],
      });
    } else {
      for (const e of replyEvents(sid, replyId)) emit(sid, e);
      if (text.includes("测试对话命名"))
        setTimeout(() => {
          const task = tasks.find((item) => item.session_id === sid);
          if (task) task.name = "养老险客户服务方案";
          emit(sid, {
            type: "CUSTOM",
            id: crypto.randomUUID(),
            created_at: new Date().toISOString(),
            name: "session_updated",
            value: {},
          });
        }, 50);
    }
    return json(res, { status: "accepted", session_id: sid });
  }
  if (p.endsWith("/interrupt")) {
    const sid = p.split("/")[2];
    const task = tasks.find((item) => item.session_id === sid);
    if (task) task.is_running = false;
    emit(sid, {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      type: "REPLY_END",
      session_id: sid,
      reply_id: tasks.find((t) => t.session_id === sid)?.activeReply,
      finished_reason: "interrupted",
    });
    return json(res, { status: "accepted" }, 202);
  }
  if (p === "/manager/skills/imports") {
    if (req.method === "POST") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const field = name => raw.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]+)`))?.[1] || "";
      const job = { job_id: `import-${skillImportSequence++}`, status: "queued", stage: "queued", progress: 0, filename: raw.match(/filename="([^"\r\n]+)"/)?.[1] || "skill.zip", category: field("category"), avatar: field("avatar"), attempts: 1, created_at: date, updated_at: date, polls: 0 };
      skillImports.unshift(job);
      return json(res, job, 202);
    }
    for (const job of skillImports) {
      if (job.status === "queued" || job.status === "running") {
        job.polls++;
        job.status = job.polls > 2 ? "succeeded" : "running";
        job.stage = job.status === "succeeded" ? "completed" : "validating";
        job.progress = job.status === "succeeded" ? 100 : job.polls * 30;
        if (job.status === "succeeded") {
          job.resource_id = `imported-${job.job_id}`;
          job.resource_version = "2.3.0";
          skillResources.push({ ...skillResources[1], resource_id: job.resource_id, resource_version: job.resource_version, display_name: "导入的技能", payload: { category: job.category, avatar: job.avatar, markdown: "---\nname: 导入的技能\ndescription: 来自技能包\nversion: 2.3.0\n---\n技能说明" } });
        }
      }
    }
    return json(res, { items: skillImports });
  }
  if (p.startsWith("/manager/skills/imports/")) {
    const job = skillImports.find(item => item.job_id === p.split("/")[4]);
    if (!job) return json(res, { detail: "导入任务不存在" }, 404);
    if (p.endsWith("/retry")) Object.assign(job, { status: "queued", stage: "queued", progress: 0, error: null, attempts: job.attempts + 1, polls: 0 });
    return json(res, job, p.endsWith("/retry") ? 202 : 200);
  }
  if (p === "/manager/skills" && req.method !== "POST") {
    const items = skillResources.map(resource => ({ ...resource, payload: { ...resource.payload, markdown: undefined, files: undefined } }));
    if (url.searchParams.get("catalog") === "true") {
      return json(res, catalogFixture(items, url, {
        name: (resource) => `${resource.display_name} ${resource.description}`,
        category: (resource) => resource.payload.category,
        mine: (resource) => resource.is_installed,
        facets: {
          categories: [...new Set(items.map((item) => item.payload.category).filter(Boolean))],
          has_shareable: items.some((item) => item.can_share),
        },
      }));
    }
    return json(res, { items });
  }
  if (p === "/manager/skills" || p.startsWith("/manager/skills/")) {
    if (p.endsWith("/installation"))
      return json(res, { detail: "未获授权，启停失败" }, 403);
    if (req.method === "POST" || req.method === "PUT") {
      const input = await body(req);
      const resourceId = p.split("/")[3] || input.resource_id;
      const original = skillResources.find(resource => resource.resource_id === resourceId);
      const field = name => input.markdown.match(new RegExp(`^\\s*${name}: *(.+)$`, "m"))?.[1] || "";
      const saved = { ...(original || skillResources[1]), resource_id: resourceId, resource_version: field("version"), display_name: field("name"), description: field("description"), payload: { ...original?.payload, markdown: input.markdown, avatar: input.avatar, category: input.category, base_version: input.base_version } };
      skillResources.push(saved);
      return json(res, saved);
    }
    return json(res, skillResources.find(resource => resource.resource_id === p.split("/")[3] && (!url.searchParams.get("version") || resource.resource_version === url.searchParams.get("version"))) || skillResources[0]);
  }
  if (p === "/manager/connectors" || p === "/manager/tools") {
    if (url.searchParams.get("catalog") === "true") {
      return json(res, {
        items: [],
        next_cursor: null,
        ...(p === "/manager/tools" && !url.searchParams.has("cursor")
          ? { categories: ["系统默认", "专家工具"] }
          : {}),
      });
    }
    return json(res, { items: [] });
  }
  if (p === "/manager/preferences")
    return json(res, {
      agent_md: "# 工作规范",
      soul_md: "# 角色与风格",
      user_md: "# 关于我",
    });
  if (p === "/manager/share-recipients") {
    const items = [
      { principal_type: "group", principal_id: "company", display_name: "全公司" },
      { principal_type: "user", principal_id: "analyst", display_name: "分析师" },
      { principal_type: "group", principal_id: "research", display_name: "研究部" },
    ];
    const type = url.searchParams.get("principal_type");
    if (!type) return json(res, { items });
    const keyword = (url.searchParams.get("q") || "").toLowerCase();
    const matches = items.filter((item) => item.principal_type === type &&
      [item.principal_id, item.display_name].some((value) => value.toLowerCase().includes(keyword)));
    const page = Number(url.searchParams.get("page") || 1);
    const pageSize = 20;
    return json(res, {
      items: matches.slice((page - 1) * pageSize, page * pageSize),
      page, page_size: pageSize, has_next: matches.length > page * pageSize,
    });
  }
  if (p === "/manager/share-requests" && req.method === "POST") {
    const input = await body(req);
    const source = input.resource_type === "agent"
      ? definitions.find((item) => item.id === input.resource_id)
      : skillResources.find((item) => item.resource_id === input.resource_id);
    return json(res, {
      resource_type: input.resource_type,
      resource_id: input.resource_id,
      resource_version: source?.resource_version,
      version_label: source?.version_label,
      review_id: "review",
      review_type: input.target ? "share" : "update",
      share_scope_type: input.target?.principal_type ?? null,
      principal_id: input.target?.principal_id ?? null,
      review_status_type: "pending",
    }, 201);
  }
  if (p === "/manager/share-requests") return json(res, { items: [] });
  if (p.startsWith("/manager/admin/")) {
    if (role !== "admin") return json(res, { detail: "仅管理员" }, 403);
    if(p === '/manager/admin/reply-feedback') return json(res,{items:replyFeedback,next_cursor:null});
    if (req.method === "GET" && url.searchParams.has("page")) {
      return json(res, {
        items: [],
        page: Number(url.searchParams.get("page")),
        page_size: Number(url.searchParams.get("page_size") ?? 20),
        has_next: false,
      });
    }
    return json(res, { items: [] });
  }
  return json(res, { detail: `测试端点未实现: ${req.method} ${p}` }, 404);
}).listen(38194, "127.0.0.1");
