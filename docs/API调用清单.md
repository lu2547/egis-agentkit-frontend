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
| GET | `/manager/agents`、`/manager/teams` | `{items:DefinitionView[]}`；按服务端派生权限展示 |
| GET | `/manager/teams/{id}?view=private` | 编辑团队时读取 `orchestrator_config`；实际 view 使用可编辑列表项的 resource_view_type |
| POST | `/manager/agents` | `{agent_name,agent_display_name,payload}` |
| PUT | `/manager/agents/{id}` | 上述字段加 `config_version` |
| POST / PUT | `/manager/teams[/{id}]` | `{team_name,team_display_name,payload,members,orchestrator_config}`；PUT 加 `config_version` |
| POST | `/manager/share-requests` | `{resource_type,resource_id,resource_version?}`；Skill/MCP 传选中版本，Agent/Team 不传；私有保存和共享申请分开 |
| GET | `/manager/share-requests` | `{items:Review[]}`；显示审核状态与冻结快照 |

Agent payload 实际提交 `description/category/tags/avatar/system_prompt/starter_prompts/model_key/bindings`，编辑时保留原 `implementation`。Binding 为 `{resource_type:skill|mcp,resource_id,resource_version,resource_view_type}`，不自动把个人助理安装内容带给专家。Team payload 为分类/描述/标签/头像/示例问题及固定成员；主理人嵌入配置为 `{agent_name,agent_display_name,payload}`。

## 任务和原生事件

| 方法 | 路径 | 请求 / 响应使用 |
| --- | --- | --- |
| GET | `/manager/tasks` | `{items:Task[]}`，最近任务与搜索 |
| POST | `/manager/tasks` | `{definition_id,resource_view_type,model_key?}` → Task |
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
| GET | `/manager/tasks/{sid}/files?area=work\|artifacts&path=...` | `{items:[{name,path,is_directory,size,modified_at}]}` |
| POST | `/manager/tasks/{sid}/files?area=work` | multipart `file`；先建任务再上传；返回授权的相对路径 |
| GET | `/manager/tasks/{sid}/file?area=...&path=...` | 授权 bytes；fetch 附带 Bearer 后创建临时 blob URL |
| POST | `/manager/tasks/{sid}/deliver` | `{path}`，工作文件转正式交付 |

上传的工作区相对路径附在用户问题中供原生工具读取，不发送宿主路径。文本/Markdown 直接预览；HTML 使用 sandbox="" 的 iframe，允许静态展示，不开启脚本或同源权限。图片采用 PNG/JPEG/GIF/WebP 白名单；PDF 使用隔离 iframe；其他格式下载查看。Markdown 使用 marked + DOMPurify。

## Skill / MCP / 偏好

| 方法 | 路径 | 请求 / 响应使用 |
| --- | --- | --- |
| GET | `/manager/skills`、`/manager/connectors` | `{items:ResourceView[]}`；区分资源可用、个人安装和启停 |
| GET | `/manager/{skills\|connectors}/{id}?version=...` | 指定版本详情，切换时隔离旧请求 |
| POST | `/manager/skills` | `{resource_id,resource_version,display_name,description,markdown,is_skill_market_visible}`；编辑发布新版本 |
| POST | `/manager/skills/upload?version=...` | multipart `file` |
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
| GET / POST | `/manager/admin/grants` | 列表 / `{principal_type,principal_id,resource_type,resource_id,resource_view_type,resource_owner_type,resource_owner_id}`；all_users 的 principal_id 为 `*` |
| DELETE | `/manager/admin/grants/{id}` | 撤销单个授权来源，不删除其他来源 |
| GET | `/manager/admin/share-reviews` | `{items:Review[]}` |
| POST | `/manager/admin/share-reviews/{id}/decision` | `{is_approved,reason}` |
| GET | `/manager/admin/packages` | `{items:Asset[]}`，读取 `is_loaded/error/is_enabled` |
| POST | `/manager/admin/packages` | `{package_path,assembly_ref,assembly_version,entrypoint,owner_id:'system'}`；受配置 release_roots 限制 |
| DELETE | `/manager/admin/packages/{id}?version=...` | 停用明确版本 |

## 尚未提供的操作

当前界面没有全量 ReMe 管理、任意 Python Tool/Middleware 上传、模型密钥编辑或动态组队入口。`manager.ts` 中保留了 Definition DELETE 与资源 PUT 封装，但当前页面未暴露删除按钮或原地覆盖发布版本操作。
