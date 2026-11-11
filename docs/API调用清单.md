# 前端 V1 实际 API 调用

更新：2026-11-04。代码位置：`src/api/http.ts`、`manager.ts`、`runtime.ts`；详情下载/文件预览分别位于 ResourceDetailDrawer/FilePreview。下表路径为后端路径，浏览器统一加 `/api`，Vite 代理去掉该前缀。`id`、`sid` 和所有路径段用 `encodeURIComponent`；查询参数用 `URLSearchParams`。

除登录外，统一发送 `Authorization: Bearer <access_token>`。令牌只保存在当前浏览器会话的 sessionStorage。401 清除身份并打开登录页；其他错误显示服务端 `{detail}`。JSON 请求 Content-Type 为 application/json；multipart 不手工设置 Content-Type。

## 身份和目录

| 方法 | 路径 | 请求 / 响应使用 |
| --- | --- | --- |
| POST | `/auth/login` | `{user_id,password}` → `{access_token}`；仅服务端明确开启的演示登录 |
| GET | `/manager/me` | User，使用 `role_type=user/admin` |
| GET | `/manager/assistant` | 个人助理 DefinitionView |
| GET | `/manager/models` | `{items:[{key,display_name}],default_key}`；不读取密钥 |
| GET | `/manager/agents?cursor=...` | `{items:DefinitionView[],next_cursor}`，首次省略游标，返回 `null` 时读完 |
| GET | `/manager/teams` | `{items:DefinitionView[]}` |
| GET | `/manager/{agents\|teams}/{id}?view=...&resource_version=...` | 读取指定发布版本；编辑读取当前版本及 `config_version`，团队编辑另读 `orchestrator_config` |
| GET | `/manager/{agents\|teams}/{id}/versions` | `{items:[{resource_version,resource_view_type}]}`，仅返回当前用户可见的版本 |
| POST | `/manager/agents` | `{agent_name,agent_display_name,payload}` |
| PUT | `/manager/agents/{id}` | 提交上次读取的 `config_version`，保存后返回新发布版本 |
| POST / PUT | `/manager/teams[/{id}]` | `{team_name,team_display_name,payload,members,orchestrator_config}`，更新时同样校验 `config_version` 并发布新版本 |
| GET | `/manager/share-recipients` | `{items:[{principal_type,principal_id,display_name}]}`，包含用户和组织组 |
| POST | `/manager/share-requests` | `{resource_type,resource_id,resource_version,principal_type,principal_id}`，资源类型为专家、专家团、技能或连接器 |
| GET | `/manager/share-requests` | `{items:Review[]}`，显示审核状态、接收对象和确切版本 |

Agent payload 提交 `description/category/tags/avatar/starter_prompts/model_key/execution_type`。原生专家还提交 `system_prompt/bindings`，远程专家提交 `remote_config`。Binding 为 `{resource_type:skill|mcp|tool,resource_id,resource_version,resource_view_type}`。Team payload 为分类、描述、标签、头像、示例问题和固定成员，主理人嵌入配置为 `{agent_name,agent_display_name,payload}`。团队成员和邀请均使用 `{definition_id,resource_view_type,resource_version}`。

## 任务和原生事件

| 方法 | 路径 | 请求 / 响应使用 |
| --- | --- | --- |
| GET | `/manager/tasks` | `{items:Task[]}`，最近任务与搜索 |
| POST | `/manager/tasks` | `{definition_id,resource_view_type,resource_version,model_key?}` → Task |
| GET | `/manager/tasks/{sid}` | Task；使用返回的 `agent_id` |
| GET | `/sessions/{sid}/messages?agent_id=...&limit=50[&before=...]` | `{messages,event_cursor,is_running,has_more}`；before 为最早消息 ID |
| GET | `/sessions/{sid}/stream?agent_id=...[&after=...]` | 原生 AgentEvent SSE；after 使用历史 event_cursor；断线重放通过事件 ID 去重 |
| POST | `/chat/` | `{agent_id,session_id,input: SDK UserMsg}`；先订阅成功，再提交 |
| POST | `/chat/` | 同一外壳，input 为原生 `USER_CONFIRM_RESULT`：`{id,created_at,type,reply_id,confirm_results:[{confirmed,tool_call,rules:null}]}` |
| POST | `/sessions/{sid}/interrupt?agent_id=...` | body `null`；界面等待原生 REPLY_END 才结束停止状态 |

事件正文不重新编码。`appendEvent` 来自 `@agentscope-ai/agentscope/message`。REPLY_START 同 reply_id 重用消息，事件去重使用事件 id；分片、CRLF、多行和心跳由 SSE decoder 处理。团队成员确认消费原生 CUSTOM `subagent_require_user_confirm` / `subagent_user_confirm_result`，确认发往领导会话，由服务端路由。

## 文件和交付

| 方法 | 路径 | 请求 / 响应使用 |
| --- | --- | --- |
| GET | `/manager/projects/{id}/files?area=uploads\|work\|artifacts&path=...` | `{items:[{name,path,is_directory,size,modified_at}]}` |
| POST | `/manager/projects/{id}/files?area=uploads` | multipart `file`，返回项目中的相对路径 |
| GET | `/manager/projects/{id}/file?area=...&path=...` | 授权 bytes，fetch 附带 Bearer 后创建临时 blob URL |
| GET | `/manager/projects/{id}/file-changes` | `{items,next_cursor,scan_error}` |
| GET | `/manager/tasks/{sid}/artifacts` | `{items:ReplyArtifact[]}`，按回复 ID 展示该对话的交付产物 |

上传的工作区相对路径附在用户问题中供原生工具读取，不发送宿主路径。文本/Markdown 直接预览；HTML 使用 sandbox="" 的 iframe，允许静态展示，不开启脚本或同源权限。图片采用 PNG/JPEG/GIF/WebP 白名单；PDF 使用隔离 iframe；其他格式下载查看。Markdown 使用 marked + DOMPurify。

## Skill / MCP / 工具 / 偏好

| 方法 | 路径 | 请求 / 响应使用 |
| --- | --- | --- |
| GET | `/manager/skills`、`/manager/connectors` | `{items:ResourceView[]}`；区分资源可用、个人安装和启停 |
| GET | `/manager/tools`、`/manager/tools/{id}?version=...` | 只读目录和详情，`is_system_default` 标记系统默认工具，`is_agent_tool` 标记可绑定的专家工具 |
| GET | `/manager/{skills\|connectors}/{id}?version=...` | 指定版本详情，切换时隔离旧请求 |
| POST | `/manager/skills` | `{resource_id,resource_version,display_name,description,markdown,is_skill_market_visible}`；编辑发布新版本 |
| POST | `/manager/skills/imports` | multipart `file`、`category`、`avatar`，返回导入任务 |
| GET | `/manager/skills/imports`、`/manager/skills/imports/{id}` | 查看导入任务及进度 |
| POST | `/manager/skills/imports/{id}/retry` | 重试导入任务 |
| GET | `/manager/skills/{id}/download?version=...` | 授权包下载 |
| POST | `/manager/connectors` | `{resource_id,resource_version,display_name,description,config:{transport:streamable_http\|sse,url,credential_ref?}}` |
| POST | `/manager/{skills\|connectors}/{id}/install?version=...` | 安装明确版本，成功才更新安装状态 |
| PATCH | `/manager/{skills\|connectors}/{id}/installation?version=...` | `{is_enabled}`，失败保留原状态 |
| POST | `/manager/connectors/{id}/test?version=...` | `{is_connected,tools:[{name,description,input_schema}],error?}` |
| GET / PUT | `/manager/preferences` | `{agent_md,soul_md,user_md}`；无 memory.md 编辑器 |

## 管理员

普通用户不渲染管理组件，直接打开管理路由显示无权限；后端仍须强制校验。

| 方法 | 路径 | 请求 / 响应使用 |
| --- | --- | --- |
| GET | `/manager/admin/users` | `{items:User[]}` |
| PUT | `/manager/admin/users/{user_id}` | 完整 User `{user_id,username,role_type,group_ids,is_enabled}`；用户 ID 不变 |
| GET / POST | `/manager/admin/groups` | 列表 / `{group_id,group_name,is_enabled}` |
| PUT | `/manager/admin/groups/{group_id}` | 同上；成员通过用户的 group_ids 调整 |
| GET | `/manager/admin/grant-resources` | 可授予使用权限的已发布版本 |
| GET / POST | `/manager/admin/grants` | 列表 / `{principal_type,principal_id,resource_type,resource_id,resource_version,resource_view_type,resource_owner_type,resource_owner_id}`，接收对象为用户或组织组 |
| DELETE | `/manager/admin/grants/{id}` | 撤销单个授权来源，不删除其他来源 |
| GET | `/manager/admin/share-reviews` | `{items:Review[]}` |
| POST | `/manager/admin/share-reviews/{id}/decision` | `{is_approved,reason}` |

## 尚未提供的操作

当前界面没有全量 ReMe 管理、任意 Python Tool/Middleware 上传、模型密钥编辑或动态组队入口。`manager.ts` 中保留了 Definition DELETE 与资源 PUT 封装，但当前页面未暴露删除按钮或原地覆盖发布版本操作。
