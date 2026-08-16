# 复现包：在 deepseek-harness 源码工作区启用 OpenCode Zen 全部免费模型

本文档是**纯复现包**：只包含把「llm-pi-ai 路由级 userAgent 覆盖」能力合入 harness 源码工作区所需的补丁与验证脚本，供另一台设备上的 agent/开发者照做。

日常配置、模型清单、故障排查已移入公开方法仓库（本文件不复述）：
- https://github.com/tovuse/Use-Opencode-Zen-s-free-models-in-dsh（README.md 英文 / README.zh-CN.md 中文）

> 版本兼容提示：本复现包针对 harness 源码工作区（`pnpm workspaces`）。已发布的 `@deepseek-ai/dsh-*@0.1.0-rc.5` 不含此改动；使用源码仓库时按第 4 步应用内嵌补丁即可。若后续该改动已合入正式发布版，第 4 步可跳过（见第 7 节）。

## 1. 何时需要本文件

- 你的 harness 是源码工作区，且缺少路由级 `userAgent` 能力（向 `opencode-zen` 等按 UA 分流的网关发请求报 `FreeUsageLimitError`）。
- 检查是否已合入（已合入则本文件第 4 步可跳过）：

```sh
git log --oneline -1 --grep="route-user-agent"
```

## 2. 前置条件清单

| 项 | 要求 | 检查命令 |
|---|---|---|
| git | 可用 | `git --version` |
| Node.js | `^22.19 \|\| >=24` | `node --version` |
| pnpm | 可用（workspaces） | `pnpm --version` |
| 网络 | 能访问 `opencode.ai` 与 npm 源 | `curl -sS https://opencode.ai/zen/v1/models -o /dev/null -w "%{http_code}\n"` |
| Zen API key | 你有（来自 opencode 账号） | 写入 `~/.dsh/.credentials.yaml`，**不要写进任何会提交的文件** |

## 3. 准备源码工作区

```sh
git clone https://github.com/deepseek-ai/deepseek-harness deepseek-harness
cd deepseek-harness
pnpm install          # 首次约 30s+
```

## 4. 应用必需代码改动

把下面 `patch` 代码块**原样完整**保存为文件 `0001-feat-llm-pi-ai-route-user-agent.patch`（保留所有内容，一行不改），然后应用：

```sh
git apply --check 0001-feat-llm-pi-ai-route-user-agent.patch   # 应无输出
git apply 0001-feat-llm-pi-ai-route-user-agent.patch
rm 0001-feat-llm-pi-ai-route-user-agent.patch
```

若 `--check` 报冲突，先用三路合并试一次：`git apply --3way 0001-feat-llm-pi-ai-route-user-agent.patch`；仍失败说明远程版本已分叉，应改用第 7 节路径或找仓库作者合并。

验证补丁已生效（必须能看到 `userAgent` 两处）：

```sh
git grep -n "userAgent" -- packages/llm/llm-pi-ai/src/config.ts packages/llm/llm-pi-ai/src/adapter.ts
```

预期输出：config.ts 的接口字段与 schema、adapter.ts 的 `requestHeaders(...)` 与 `profile.userAgent`。

```patch
From eb888cfdb8d5d744079d44c792b2a48e15d60f6b Mon Sep 17 00:00:00 2001
From: Tovuse <3357938191@qq.com>
Date: Mon, 17 Aug 2026 04:04:24 +0800
Subject: [PATCH] feat(llm-pi-ai): allow a provider route to replace the
 attribution User-Agent

A pi-ai provider profile gains a userAgent field: the full wire User-Agent
value for that route, replacing the shared harness attribution UA on the
requests that route serves. Routes without one keep the mandatory
attribution unchanged. This opens UA-routed gateways whose first-party
pool only serves a specific client identity (OpenCode Zen requires the
opencode UA) while every other route keeps the harness identity.
---
 ...andatory-app-attribution-headers.i18n.yaml |  4 +-
 ...06-21-mandatory-app-attribution-headers.md |  2 +-
 ...21-mandatory-app-attribution-headers.zh.md |  2 +-
 ...-pi-ai-route-user-agent-override.i18n.yaml |  6 +++
 ...6-08-17-pi-ai-route-user-agent-override.md | 38 +++++++++++++++++++
 ...8-17-pi-ai-route-user-agent-override.zh.md | 38 +++++++++++++++++++
 docs/config-catalog.i18n.yaml                 |  4 +-
 docs/config-catalog.md                        |  9 ++++-
 docs/config-catalog.zh.md                     |  9 ++++-
 docs/subsystems/llm-streaming.i18n.yaml       |  4 +-
 docs/subsystems/llm-streaming.md              |  2 +-
 docs/subsystems/llm-streaming.zh.md           |  2 +-
 packages/llm/llm-pi-ai/README.i18n.yaml       |  4 +-
 packages/llm/llm-pi-ai/README.md              |  4 +-
 packages/llm/llm-pi-ai/README.zh.md           |  4 +-
 packages/llm/llm-pi-ai/src/adapter.ts         | 20 ++++++++--
 packages/llm/llm-pi-ai/src/config.ts          | 11 ++++++
 packages/llm/llm-pi-ai/tests/adapter.spec.ts  | 12 ++++++
 18 files changed, 153 insertions(+), 22 deletions(-)
 create mode 100644 .agents/notes/implemented/architecture/2026-08-17-pi-ai-route-user-agent-override.i18n.yaml
 create mode 100644 .agents/notes/implemented/architecture/2026-08-17-pi-ai-route-user-agent-override.md
 create mode 100644 .agents/notes/implemented/architecture/2026-08-17-pi-ai-route-user-agent-override.zh.md

diff --git a/.agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.i18n.yaml b/.agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.i18n.yaml
index 687743c0a4..5b2bfaecc1 100644
--- a/.agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.i18n.yaml
+++ b/.agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.i18n.yaml
@@ -2,5 +2,5 @@
 # side as of the last confirmed-consistent state. Both languages carry equal authority;
 # after editing either side, bring the other along and re-record with:
 #   pnpm run verify-translation-pairing --write .agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.md
-2026-06-21-mandatory-app-attribution-headers.md: 479d3a46dc41c5cc9ae9b77b81dbef3d6524370b
-2026-06-21-mandatory-app-attribution-headers.zh.md: 75162604623099d50ca87aafd5d45567e2121789
+2026-06-21-mandatory-app-attribution-headers.md: fab0f2f81edd6d9d8470e7f6907b1bb87784fa7e
+2026-06-21-mandatory-app-attribution-headers.zh.md: e590462b063d621a5e1f82ce8bf1dead784e2348
diff --git a/.agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.md b/.agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.md
index 479d3a46dc..fab0f2f81e 100644
--- a/.agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.md
+++ b/.agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.md
@@ -34,7 +34,7 @@ The provider-neutral identity is owned by `dsh-llm` (`packages/llm/llm/src/attri
 - version: read from the owning package's manifest via `createRequire`, never a hand-copied constant
 - app URL: `https://github.com/deepseek-ai/deepseek-harness` - the repository home
 
-The default is mandatory and non-empty. White-label deployments pass their own `AppIdentity` to `attributionHeaders(identity)` - the override hook is the function parameter, with no deployment config plumbing until a consumer needs it - and omission falls back to the harness default rather than suppressing attribution. There is no per-request API for the model, user prompt, session id, cwd, user email, API key owner, or local machine identity to influence these fields.
+The default is mandatory and non-empty. White-label deployments pass their own `AppIdentity` to `attributionHeaders(identity)` - the override hook is the function parameter - and omission falls back to the harness default rather than suppressing attribution. A pi-ai provider route may replace the `User-Agent` on the requests it serves through its route `userAgent` field, the one explicit route-level escape this decision deferred until a consumer needed it ([route override decision](2026-08-17-pi-ai-route-user-agent-override.md)); every other request keeps the mandatory attribution. There is no per-request API for the model, user prompt, session id, cwd, user email, API key owner, or local machine identity to influence these fields.
 
 Wire mapping (`attributionHeaders`; header names lowercase in code - HTTP field names are case-insensitive on the wire):
 
diff --git a/.agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.zh.md b/.agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.zh.md
index 7516260462..e590462b06 100644
--- a/.agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.zh.md
+++ b/.agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.zh.md
@@ -34,7 +34,7 @@ OpenRouter 应用归属刻意未实现。`HTTP-Referer`、`X-OpenRouter-Title`
 - 版本：通过 `createRequire` 从所属包的 manifest（元数据清单）读取，绝不手动复制常量
 - 应用 URL：`https://github.com/deepseek-ai/deepseek-harness`——仓库主页
 
-默认值是强制的且非空。白标部署通过向 `attributionHeaders(identity)` 传入自己的 `AppIdentity` 来覆盖——覆盖钩子就是函数参数，在有消费方需要之前不做部署配置管道——省略时回退到 harness 默认值而非抑制归属。没有逐请求 API 允许模型、用户提示词、会话 id、cwd、用户邮箱、API key 所有者或本地机器身份影响这些字段。
+默认值是强制的且非空。白标部署通过向 `attributionHeaders(identity)` 传入自己的 `AppIdentity` 来覆盖——覆盖钩子就是函数参数——省略时回退到 harness 默认值而非抑制归属。pi-ai 提供方路由可以通过其路由 `userAgent` 字段替换该路由所服务请求上的 `User-Agent`，这是该决策推迟到出现消费方才提供的唯一显式路由级逃生口（[路由覆盖决策](2026-08-17-pi-ai-route-user-agent-override.md)）；其他每个请求都保留强制归因。没有逐请求 API 允许模型、用户提示词、会话 id、cwd、用户邮箱、API key 所有者或本地机器身份影响这些字段。
 
 线路映射（`attributionHeaders`；代码中头部名称小写——HTTP 字段名在线路上不区分大小写）：
 
diff --git a/.agents/notes/implemented/architecture/2026-08-17-pi-ai-route-user-agent-override.i18n.yaml b/.agents/notes/implemented/architecture/2026-08-17-pi-ai-route-user-agent-override.i18n.yaml
new file mode 100644
index 0000000000..face838b89
--- /dev/null
+++ b/.agents/notes/implemented/architecture/2026-08-17-pi-ai-route-user-agent-override.i18n.yaml
@@ -0,0 +1,6 @@
+# Bilingual-pair consistency record (docs/i18n/README.md): the git blob hash of each
+# side as of the last confirmed-consistent state. Both languages carry equal authority;
+# after editing either side, bring the other along and re-record with:
+#   pnpm run verify-translation-pairing --write .agents/notes/implemented/architecture/2026-08-17-pi-ai-route-user-agent-override.md
+2026-08-17-pi-ai-route-user-agent-override.md: 22c1a4385e8612b78b486d9161ac5d4c814bbf3d
+2026-08-17-pi-ai-route-user-agent-override.zh.md: b34b7534560c9a50b0afb2a3e740be3e2399796c
diff --git a/.agents/notes/implemented/architecture/2026-08-17-pi-ai-route-user-agent-override.md b/.agents/notes/implemented/architecture/2026-08-17-pi-ai-route-user-agent-override.md
new file mode 100644
index 0000000000..22c1a4385e
--- /dev/null
+++ b/.agents/notes/implemented/architecture/2026-08-17-pi-ai-route-user-agent-override.md
@@ -0,0 +1,38 @@
+# Agent Note: A pi-ai route can replace the shared attribution User-Agent
+
+Status: implemented
+
+English | [中文](2026-08-17-pi-ai-route-user-agent-override.zh.md)
+
+## Problem
+
+The harness identifies every provider request with the shared attribution `User-Agent` from `attributionHeaders()`, mandatory under [the attribution decision](2026-06-21-mandatory-app-attribution-headers.md). The pi-ai adapter filters any `user-agent` name out of the profile `headers` before merging attribution, so a deployment whose gateway routes on the client identity could not express one.
+
+OpenCode Zen is that gateway. Its first-party pool serves only requests whose `User-Agent` is `opencode`; every other UA lands in the shared third-party pool, which the free tier exhausts. The harness's mandatory attribution made the first-party pool unreachable: a request from the harness arrived labeled `deepseek-harness/{version} (+https://github.com/deepseek-ai/deepseek-harness)` and was refused with `FreeUsageLimitError` while a request labeled `opencode` from the same account succeeded. Configuring `headers: { 'user-agent': opencode }` did nothing, by design: attribution wins reserved header names.
+
+The existing white-label escape — `attributionHeaders(identity)` — is app-global. It relabels every route, including the routes that must keep the harness identity, and it is a whole-application identity, not a per-gateway one.
+
+## Decision
+
+The pi-ai provider profile gains a `userAgent` field: the full wire `User-Agent` value for that route. It replaces the shared attribution UA on the requests that route serves, and only those; a route without it keeps the attribution exactly as before. The merge in `requestHeaders` is profile headers (attribution-reserved names filtered) → attribution → route `userAgent`, so the route value owns the one name it replaces and nothing else. An empty value is refused where the route is validated, like `baseURL` and `displayName`. The field is a route property of the resolved profile, documented on the profile schema and in the package README.
+
+Model discovery is untouched. `discoverModels` interrogates a draft endpoint carried by `LlmModelDiscoveryRequest`, which has no resolved profile to read a `userAgent` from, and its listing fetch is a configuration-surface action rather than a model-serving request.
+
+This is a partial supersession of [the mandatory-attribution decision](2026-06-21-mandatory-app-attribution-headers.md): the mandate holds by default on every route, and this field is the one explicit, documented escape the decision deferred until a consumer needed it.
+
+## Alternatives considered
+
+- **Honor a profile `headers` entry named `user-agent`.** Rejected. The reserved-name filter is the mechanism that keeps a deployment from clobbering attribution by accident; silently honoring one reserved name would reintroduce exactly the drift the filter exists to prevent. The explicit field keeps the override discoverable, documented, and validated.
+- **Call `attributionHeaders(identity)` from configuration.** Rejected. It is the whole-application white-label seam and would change every route's identity, including routes that must keep the harness identity on the wire.
+- **A per-request attribution option on `GenerateOptions` or the `LlmAdapter` contract.** Rejected. The identity is a route property, not a request property; a request-level seam would widen the `dsh-llm` contract and let model-visible call paths influence attribution for a single adapter's need.
+- **`discoverModels` honoring `userAgent` too.** Rejected. It carries a draft, not a resolved profile; threading the field through `LlmModelDiscoveryRequest` expands the change into `dsh-llm` and its callers for a metadata fetch the routing case never needs.
+
+## Consequences
+
+A deployment pointed at a UA-routed gateway names its identity per route while every other route keeps the mandatory attribution. A route that sets `userAgent` is indistinguishable on the wire from the client it names — the same trade a white-label `AppIdentity` already accepts, scoped to one route. The field is the UA string itself: it carries no secrets, and its value is a public product fact the deployment owns.
+
+The routing case is real: with `userAgent: opencode` on the `opencode-zen` route, the live gateway serves the models the shared pool had refused (`big-pickle` answered `PONG`; previously every first-party model ended in `FreeUsageLimitError`).
+
+## Testing
+
+`packages/llm/llm-pi-ai/tests/adapter.spec.ts` asserts the merge order on the wire: a profile `userAgent` replaces the attribution UA while the profile's non-reserved headers still arrive, and a profile header named `user-agent` still loses to attribution. The resolver case asserts an empty `userAgent` is refused like the other empty route fields. The live route runs above are validation evidence; no keyless snapshot lane exercises a pi-ai route, for the reason [the route-input-modalities note](2026-08-12-pi-ai-route-default-input-modalities.md) records, and this change alters no model-visible output — only a header on routes that opt in.
diff --git a/.agents/notes/implemented/architecture/2026-08-17-pi-ai-route-user-agent-override.zh.md b/.agents/notes/implemented/architecture/2026-08-17-pi-ai-route-user-agent-override.zh.md
new file mode 100644
index 0000000000..b34b753456
--- /dev/null
+++ b/.agents/notes/implemented/architecture/2026-08-17-pi-ai-route-user-agent-override.zh.md
@@ -0,0 +1,38 @@
+# Agent Note: A pi-ai route can replace the shared attribution User-Agent
+
+Status: implemented
+
+[English](2026-08-17-pi-ai-route-user-agent-override.md) | 中文
+
+## Problem
+
+harness 用 `attributionHeaders()` 的共享归因 `User-Agent` 标识每个提供方请求，这一点在[归因决策](2026-06-21-mandatory-app-attribution-headers.md)中强制成立。pi-ai 适配器在合并归因之前，会把 profile `headers` 里的 `user-agent` 名过滤掉，因此按客户端身份路由的网关无法在配置里声明自己的身份。
+
+OpenCode Zen 正是这样的网关。它的第一方池只服务 `User-Agent` 恰好为 `opencode` 的请求；其他 UA 都落到共享第三方池，而免费档把第三方池耗尽了。harness 的强制归因让第一方池不可达：来自 harness 的请求以 `deepseek-harness/{version} (+https://github.com/deepseek-ai/deepseek-harness)` 标注，被以 `FreeUsageLimitError` 拒绝，而同一账号下标注 `opencode` 的请求成功。配置 `headers: { 'user-agent': opencode }` 没有效果——这是设计使然：归因赢保留标头名。
+
+现有的白标逃生口 `attributionHeaders(identity)` 是应用级的。它会重标每一条路由，包括必须保留 harness 身份的路由，而且它是整应用身份，不是按网关的身份。
+
+## Decision
+
+pi-ai 的提供方 profile 新增 `userAgent` 字段：该路由完整的线上 `User-Agent` 值。它只替换该路由所服务请求上的共享归因 UA；没有它的路由与之前完全一致地保留归因。`requestHeaders` 的合并顺序是 profile 标头（过滤掉归因保留名）→ 归因 → 路由 `userAgent`，因此路由值只接管它替换的那一个名字，不碰其他。空值在路由校验处被拒绝，与 `baseURL`、`displayName` 相同。该字段是已解析 profile 的路由属性，写在 profile schema 和包 README 里。
+
+模型发现不受影响。`discoverModels` 询问的是 `LlmModelDiscoveryRequest` 携带的草稿端点，没有已解析的 profile 可读 `userAgent`，而且它的列表获取是配置层面的动作，不是模型服务请求。
+
+这是对[强制归因决策](2026-06-21-mandatory-app-attribution-headers.md)的部分取代：该强制默认在每条路由上仍然成立，而这个字段是那条决策推迟到出现消费方才提供的、唯一明确且有文档的逃生口。
+
+## Alternatives considered
+
+- **让 profile `headers` 里名为 `user-agent` 的条目生效。** 拒绝。保留名过滤正是防止部署意外覆盖归因的机制；悄悄放行一个保留名会重新引入该过滤本要杜绝的漂移。显式字段让覆盖可发现、有文档、可校验。
+- **从配置调用 `attributionHeaders(identity)`。** 拒绝。那是整应用白标接口，会改变每条路由的身份，包括必须在线上保留 harness 身份的路由。
+- **在 `GenerateOptions` 或 `LlmAdapter` 契约上加每请求归因选项。** 拒绝。身份是路由属性，不是请求属性；请求级接口会拓宽 `dsh-llm` 契约，并让模型可见的调用路径为单一适配器的需要去影响归因。
+- **`discoverModels` 也遵循 `userAgent`。** 拒绝。它携带的是草稿而不是已解析 profile；把该字段穿过 `LlmModelDiscoveryRequest` 会把改动扩大到 `dsh-llm` 及其调用方，而路由场景根本用不到一次元数据获取。
+
+## Consequences
+
+指向按 UA 路由的网关的部署，可以按路由声明自己的身份，而其他每条路由都保留强制归因。设置 `userAgent` 的路由在线上与被点名的客户端无法区分——这与白标 `AppIdentity` 已经接受的取舍相同，只是限定在一条路由上。该字段本身就是 UA 字符串：它不携带任何秘密，它的值是部署拥有的公开产品事实。
+
+路由场景是真实的：`opencode-zen` 路由配上 `userAgent: opencode` 后，线上网关开始服务共享池曾拒绝的模型（`big-pickle` 回答 `PONG`；此前每个第一方模型都以 `FreeUsageLimitError` 结束）。
+
+## Testing
+
+`packages/llm/llm-pi-ai/tests/adapter.spec.ts` 在线上断言合并顺序：profile 的 `userAgent` 替换归因 UA，同时 profile 的非保留标头仍然到达；名为 `user-agent` 的 profile 标头仍然输给归因。解析器用例断言空 `userAgent` 与其他空路由字段一样被拒绝。上面的一次次真实路由运行是验证证据；没有无密钥快照通道覆盖 pi-ai 路由，原因见[路由输入模态笔记](2026-08-12-pi-ai-route-default-input-modalities.md)的记载，而且本改动不改变任何模型可见输出——只改选择加入的路由上的一个标头。
diff --git a/docs/config-catalog.i18n.yaml b/docs/config-catalog.i18n.yaml
index f5a845ad5f..f35a84cf99 100644
--- a/docs/config-catalog.i18n.yaml
+++ b/docs/config-catalog.i18n.yaml
@@ -2,5 +2,5 @@
 # side as of the last confirmed-consistent state. Both languages carry equal authority;
 # after editing either side, bring the other along and re-record with:
 #   pnpm run verify-translation-pairing --write docs/config-catalog.md
-config-catalog.md: 20919b3fdc5ab26255465949d72bdce8d356a529
-config-catalog.zh.md: 8dfb49df5e3f5906af859a4de83ebc44f315a0bd
+config-catalog.md: 22c1dcb0e3cf634e61b6dfea974b1cca9b6f86c8
+config-catalog.zh.md: 538fcd1797ffbfed7ac0a15500fe88c63ff05f7a
diff --git a/docs/config-catalog.md b/docs/config-catalog.md
index 20919b3fdc..22c1dcb0e3 100644
--- a/docs/config-catalog.md
+++ b/docs/config-catalog.md
@@ -969,6 +969,13 @@ export interface PiAiProviderProfile {
   defaultInput?: PiAiModality[]
   /** Provider request headers; Harness attribution wins reserved names. */
   headers?: Record<string, string>
+  /**
+   * Full wire `User-Agent` value for this route, replacing the shared
+   * harness attribution UA on requests this route sends. A deployment whose
+   * gateway routes on the client identity (white-label or otherwise) names
+   * its own UA here; routes without one keep the shared attribution.
+   */
+  userAgent?: string
   /** Provider-neutral pi-ai reasoning level. */
   reasoning?: ModelThinkingLevel
   /** Token budgets used by reasoning providers that support them. */
@@ -1079,7 +1086,7 @@ type WithheldThinkingFormat = 'chat-template' | 'qwen-chat-template'
 
 Depends on: `Api` (`@earendil-works/pi-ai`) · `CacheRetention` (`@earendil-works/pi-ai`) · `Model` (`@earendil-works/pi-ai`) · `ModelThinkingLevel` (`@earendil-works/pi-ai`) · `OpenAICompletionsCompat` (`@earendil-works/pi-ai`) · [`RetryPolicyConfig`](../packages/llm/llm/src/index.ts) · `ThinkingBudgets` (`@earendil-works/pi-ai`) · `Transport` (`@earendil-works/pi-ai`)
 
-Source: [`packages/llm/llm-pi-ai/src/config.ts:172`](../packages/llm/llm-pi-ai/src/config.ts)
+Source: [`packages/llm/llm-pi-ai/src/config.ts:179`](../packages/llm/llm-pi-ai/src/config.ts)
 
 <a id="deepseek-aidsh-llm-replay"></a>
 
diff --git a/docs/config-catalog.zh.md b/docs/config-catalog.zh.md
index 8dfb49df5e..538fcd1797 100644
--- a/docs/config-catalog.zh.md
+++ b/docs/config-catalog.zh.md
@@ -971,6 +971,13 @@ export interface PiAiProviderProfile {
   defaultInput?: PiAiModality[]
   /** Provider request headers; Harness attribution wins reserved names. */
   headers?: Record<string, string>
+  /**
+   * Full wire `User-Agent` value for this route, replacing the shared
+   * harness attribution UA on requests this route sends. A deployment whose
+   * gateway routes on the client identity (white-label or otherwise) names
+   * its own UA here; routes without one keep the shared attribution.
+   */
+  userAgent?: string
   /** Provider-neutral pi-ai reasoning level. */
   reasoning?: ModelThinkingLevel
   /** Token budgets used by reasoning providers that support them. */
@@ -1081,7 +1088,7 @@ type WithheldThinkingFormat = 'chat-template' | 'qwen-chat-template'
 
 依赖：`Api`（`@earendil-works/pi-ai`）· `CacheRetention`（`@earendil-works/pi-ai`）· `Model`（`@earendil-works/pi-ai`）· `ModelThinkingLevel`（`@earendil-works/pi-ai`）· `OpenAICompletionsCompat`（`@earendil-works/pi-ai`）· [`RetryPolicyConfig`](../packages/llm/llm/src/index.ts) · `ThinkingBudgets`（`@earendil-works/pi-ai`）· `Transport`（`@earendil-works/pi-ai`）
 
-来源：[`packages/llm/llm-pi-ai/src/config.ts:172`](../packages/llm/llm-pi-ai/src/config.ts)
+来源：[`packages/llm/llm-pi-ai/src/config.ts:179`](../packages/llm/llm-pi-ai/src/config.ts)
 
 <a id="deepseek-aidsh-llm-replay"></a>
 
diff --git a/docs/subsystems/llm-streaming.i18n.yaml b/docs/subsystems/llm-streaming.i18n.yaml
index 5708a7b6d5..ede8909550 100644
--- a/docs/subsystems/llm-streaming.i18n.yaml
+++ b/docs/subsystems/llm-streaming.i18n.yaml
@@ -2,5 +2,5 @@
 # side as of the last confirmed-consistent state. Both languages carry equal authority;
 # after editing either side, bring the other along and re-record with:
 #   pnpm run verify-translation-pairing --write docs/subsystems/llm-streaming.md
-llm-streaming.md: 0d3a0d53c875c9d943146ba44b775d81fc9cae01
-llm-streaming.zh.md: fbaa47d14d57e7377be4db6ecaa04f11997572a6
+llm-streaming.md: 4793db0fc0855efc0b4c32830dc3296c3e83b2a3
+llm-streaming.zh.md: 310fa0f4ea5d869c2900616a1a6621a31969929c
diff --git a/docs/subsystems/llm-streaming.md b/docs/subsystems/llm-streaming.md
index 0d3a0d53c8..4793db0fc0 100644
--- a/docs/subsystems/llm-streaming.md
+++ b/docs/subsystems/llm-streaming.md
@@ -221,7 +221,7 @@ Provider configuration resolves before route registration into an immutable disc
 
 ## `AppIdentity` — app attribution
 
-The static public application identity every adapter sends to providers ([`packages/llm/llm/src/attribution.ts`](../../packages/llm/llm/src/attribution.ts)). `attributionHeaders(identity?)` maps it to the standard `User-Agent` header only; OpenRouter-specific app attribution headers are intentionally not supported by this contract. The default `APP_IDENTITY` sources its version from the package manifest; every field is a public product fact - no secrets, paths, session ids, or per-user identifiers, and nothing per-request may influence the values. Rationale: [Mandatory `User-Agent` attribution](../../.agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.md).
+The static public application identity every adapter sends to providers ([`packages/llm/llm/src/attribution.ts`](../../packages/llm/llm/src/attribution.ts)). `attributionHeaders(identity?)` maps it to the standard `User-Agent` header only; OpenRouter-specific app attribution headers are intentionally not supported by this contract. The default `APP_IDENTITY` sources its version from the package manifest; every field is a public product fact - no secrets, paths, session ids, or per-user identifiers, and nothing per-request may influence the values. A pi-ai provider route may replace this `User-Agent` on the requests it serves through its route `userAgent` field, the one explicit route-level escape; every other request keeps this identity ([decision](../../.agents/notes/implemented/architecture/2026-08-17-pi-ai-route-user-agent-override.md)). Rationale: [Mandatory `User-Agent` attribution](../../.agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.md).
 
 ```ts type-equiv
 /**
diff --git a/docs/subsystems/llm-streaming.zh.md b/docs/subsystems/llm-streaming.zh.md
index fbaa47d14d..310fa0f4ea 100644
--- a/docs/subsystems/llm-streaming.zh.md
+++ b/docs/subsystems/llm-streaming.zh.md
@@ -223,7 +223,7 @@ interface LlmFailure {
 
 ## `AppIdentity`：应用归属
 
-每个适配器都会向提供方发送的静态公开应用标识（[`packages/llm/llm/src/attribution.ts`](../../packages/llm/llm/src/attribution.ts)）。`attributionHeaders(identity?)` 只把它映射到标准 `User-Agent` header；该约定有意不支持 OpenRouter 特有的应用归属 header。默认 `APP_IDENTITY` 从包 manifest（元数据清单）获取版本；每个字段都是公开产品事实——不含 secret、路径、会话 id 或逐用户标识，且任何逐请求信息都不得影响这些值。设计理由见[强制 `User-Agent` 归属](../../.agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.md)。
+每个适配器都会向提供方发送的静态公开应用标识（[`packages/llm/llm/src/attribution.ts`](../../packages/llm/llm/src/attribution.ts)）。`attributionHeaders(identity?)` 只把它映射到标准 `User-Agent` header；该约定有意不支持 OpenRouter 特有的应用归属 header。默认 `APP_IDENTITY` 从包 manifest（元数据清单）获取版本；每个字段都是公开产品事实——不含 secret、路径、会话 id 或逐用户标识，且任何逐请求信息都不得影响这些值。pi-ai 提供方路由可以通过其路由 `userAgent` 字段替换该路由所服务请求上的 `User-Agent`，这是唯一显式的路由级逃生口；其他每个请求都保留此标识（[决策](../../.agents/notes/implemented/architecture/2026-08-17-pi-ai-route-user-agent-override.md)）。设计理由见[强制 `User-Agent` 归属](../../.agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.md)。
 
 ```ts type-equiv
 /**
diff --git a/packages/llm/llm-pi-ai/README.i18n.yaml b/packages/llm/llm-pi-ai/README.i18n.yaml
index 31e6ac3b8a..7ef56e549a 100644
--- a/packages/llm/llm-pi-ai/README.i18n.yaml
+++ b/packages/llm/llm-pi-ai/README.i18n.yaml
@@ -2,5 +2,5 @@
 # side as of the last confirmed-consistent state. Both languages carry equal authority;
 # after editing either side, bring the other along and re-record with:
 #   pnpm run verify-translation-pairing --write packages/llm/llm-pi-ai/README.md
-README.md: 6120f8d982c6d475cd508e6cf9e41cabfc9ba159
-README.zh.md: 4b47976c6c6c67968b5b93edbdfd5dfa9530eb1d
+README.md: 33355bbedd0c9e89d5a1e63720f1b68fd19d01b1
+README.zh.md: 4a1ae98934e51a3abc7388920aa10b1f145b91a7
diff --git a/packages/llm/llm-pi-ai/README.md b/packages/llm/llm-pi-ai/README.md
index 6120f8d982..33355bbedd 100644
--- a/packages/llm/llm-pi-ai/README.md
+++ b/packages/llm/llm-pi-ai/README.md
@@ -113,7 +113,7 @@ A model that carries reasoning metadata — from the installed catalog or from i
 
 A model **without** that metadata — a hand-declared one whose entry declares no `reasoningEfforts`, and a catalog model pi-ai marks as non-reasoning — exposes no `reasoning` at all. pi-ai reports such a model as supporting the single level `off`, but `off` is translated to *omitting* the reasoning option, which is byte-for-byte the request that naming no effort already produces: selecting it could not disable anything, so a provider whose own default is to think would keep thinking with `off` shown as selected. Reporting the capability as unavailable leaves a surface offering the provider's default and nothing that misrepresents it. The profile `reasoning` value, including `off`, is the deployment default when configured; omitting it preserves the provider default. Per-request `GenerateOptions.reasoningEffort` takes precedence, and a level absent from the exact model capability fails the REQUEST with `UNSUPPORTED_REASONING_EFFORT` before network I/O instead of being clamped. Describing a model never fails that way: the models under one provider disagree about which levels they accept, so `resolveModel` reports a profile level the exact model cannot take as no default at all rather than throwing. A throw there would take the whole provider out of every model catalog built over it — one mis-set profile field hiding even the models that do support the level — so a bad configuration surfaces where it is acted on, not where it is described. pi-ai's common stream options represent `off` by omitting `reasoning`.
 
-Supported profile fields are `apiKeyEnv`, `displayName`, `api`, `baseURL`, `models`, `modelOverrides`, `compat`, `defaultContextWindow`, `defaultMaxTokens`, `defaultInput`, `headers`, `reasoning`, `thinkingBudgets`, `cacheRetention`, `transport`, `timeoutMs`, `websocketConnectTimeoutMs`, `streamIdleTimeoutMs`, and `retryPolicy`. Each profile's optional retry policy is captured with that provider route; omission uses bounded normal defaults. The stream-idle interval is a positive finite Node timer delay, defaults to five minutes, and covers only an outstanding provider read, not consumer think time. Harness app attribution wins a conflicting configured header name.
+Supported profile fields are `apiKeyEnv`, `displayName`, `api`, `baseURL`, `models`, `modelOverrides`, `compat`, `defaultContextWindow`, `defaultMaxTokens`, `defaultInput`, `headers`, `userAgent`, `reasoning`, `thinkingBudgets`, `cacheRetention`, `transport`, `timeoutMs`, `websocketConnectTimeoutMs`, `streamIdleTimeoutMs`, and `retryPolicy`. Each profile's optional retry policy is captured with that provider route; omission uses bounded normal defaults. The stream-idle interval is a positive finite Node timer delay, defaults to five minutes, and covers only an outstanding provider read, not consumer think time. Harness app attribution wins a conflicting configured header name, and the profile `userAgent` — the full wire `User-Agent` value — replaces the attribution UA for that route alone.
 
 The adapter forces pi-ai's SDK `maxRetries` to zero so one `stream()` call makes one provider request. The removed profile fields `maxRetries` and `maxRetryDelayMs` fail load instead of silently multiplying or hiding the separately composed agent-level retry budget. Idle expiry aborts the SDK's stable request signal and surfaces `TIMEOUT`; an earlier caller abort remains `ABORTED`.
 
@@ -151,7 +151,7 @@ If a listener rewrites assembled assistant content, the loop drops replay state
 
 ## App attribution
 
-Every request carries the shared attribution header from dsh-llm's `attributionHeaders()`, merged through pi-ai's `headers` stream option. Provider-specific app-attribution headers are not synthesized. See [dsh-llm § App attribution](../llm/README.md#app-attribution-attributionts).
+Every request carries the shared attribution header from dsh-llm's `attributionHeaders()`, merged through pi-ai's `headers` stream option. Provider-specific app-attribution headers are not synthesized. A route whose profile sets `userAgent` replaces the attribution `User-Agent` on that route's requests with the declared value — the same replacement a white-label deployment applies globally, scoped to one route. See [dsh-llm § App attribution](../llm/README.md#app-attribution-attributionts).
 
 ## Dependency weight
 
diff --git a/packages/llm/llm-pi-ai/README.zh.md b/packages/llm/llm-pi-ai/README.zh.md
index 4b47976c6c..4a1ae98934 100644
--- a/packages/llm/llm-pi-ai/README.zh.md
+++ b/packages/llm/llm-pi-ai/README.zh.md
@@ -114,7 +114,7 @@ profile 的 `models` 列表是*替换*该路由已安装 catalog，而不是扩
 
 **没有**这份元数据的模型——条目未声明 `reasoningEfforts` 的手工声明模型，以及 pi-ai 标记为不具备推理能力的 catalog 模型——完全不公开 `reasoning`。pi-ai 会把这类模型报告为只支持 `off` 一档，但 `off` 会被翻译成*省略* reasoning 选项，而那与「不点名任何档位」产出的请求逐字节相同：选它关不掉任何东西，于是自身默认就在思考的提供方，会在界面显示 `off` 被选中的同时继续思考。把该能力报告为不可用，界面就只剩提供方默认这一项，不会再出现自相矛盾的控件。配置 profile 的 `reasoning` 值（包括 `off`）在存在时是部署默认值；省略它会保留提供方默认值。每次请求的 `GenerateOptions.reasoningEffort` 优先；未出现在确切模型能力中的档位会让**请求**在网络 I/O 前以 `UNSUPPORTED_REASONING_EFFORT` 失败，而不会被自动调整。**描述**一个模型则从不这样失败：同一提供方下各模型接受的档位并不一致，因此 `resolveModel` 对该模型拿不下的 profile 档位报告为「没有默认值」，而不是抛错。在那里抛错会让整个提供方从任何基于它构建的模型目录中消失——一个配错的 profile 字段连支持该档位的模型也一并藏起来——所以坏配置暴露在被执行处，而不是被描述处。pi-ai 的通用流选项通过省略 `reasoning` 表示 `off`。
 
-受支持的 profile 字段是 `apiKeyEnv`、`displayName`、`api`、`baseURL`、`models`、`modelOverrides`、`compat`、`defaultContextWindow`、`defaultMaxTokens`、`defaultInput`、`headers`、`reasoning`、`thinkingBudgets`、`cacheRetention`、`transport`、`timeoutMs`、`websocketConnectTimeoutMs`、`streamIdleTimeoutMs` 和 `retryPolicy`。每个 profile 的可选重试策略都会与该提供方路由一同捕获；省略时使用有界的常规默认值。流空闲间隔必须是正的有限 Node 定时器延迟，默认为五分钟，且只覆盖未完成提供方读取，不包括消费方思考时间。若已配置标头中有同名项，则以 Harness 应用归因为准。
+受支持的 profile 字段是 `apiKeyEnv`、`displayName`、`api`、`baseURL`、`models`、`modelOverrides`、`compat`、`defaultContextWindow`、`defaultMaxTokens`、`defaultInput`、`headers`、`userAgent`、`reasoning`、`thinkingBudgets`、`cacheRetention`、`transport`、`timeoutMs`、`websocketConnectTimeoutMs`、`streamIdleTimeoutMs` 和 `retryPolicy`。每个 profile 的可选重试策略都会与该提供方路由一同捕获；省略时使用有界的常规默认值。流空闲间隔必须是正的有限 Node 定时器延迟，默认为五分钟，且只覆盖未完成提供方读取，不包括消费方思考时间。若已配置标头中有同名项，则以 Harness 应用归因为准；profile 的 `userAgent`（完整的线上 `User-Agent` 值）则只对该路由把归因 UA 替换掉。
 
 适配器强制 pi-ai SDK `maxRetries` 为零，因此一次 `stream()` 调用只会发起一次提供方请求。已移除 profile 字段 `maxRetries` 和 `maxRetryDelayMs` 会使加载失败，而不是静默倍增或隐藏单独组合的 agent（智能体）级重试预算。空闲超时会 abort SDK 的稳定请求信号，并以 `TIMEOUT` 呈现；较早的调用方 abort 仍为 `ABORTED`。
 
@@ -152,7 +152,7 @@ profile 的 `models` 列表是*替换*该路由已安装 catalog，而不是扩
 
 ## 应用归因
 
-每个请求都携带 dsh-llm `attributionHeaders()` 的共享归因标头，并通过 pi-ai `headers` 流选项合并。不会合成提供方特定应用归因标头。详见 [dsh-llm § 应用归因](../llm/README.md#app-attribution-attributionts)。
+每个请求都携带 dsh-llm `attributionHeaders()` 的共享归因标头，并通过 pi-ai `headers` 流选项合并。不会合成提供方特定应用归因标头。profile 设置了 `userAgent` 的路由会用声明的值把该路由请求上的归因 `User-Agent` 替换掉——与白标部署在全局做的替换相同，只是限定在一条路由上。详见 [dsh-llm § 应用归因](../llm/README.md#app-attribution-attributionts)。
 
 ## 依赖体量
 
diff --git a/packages/llm/llm-pi-ai/src/adapter.ts b/packages/llm/llm-pi-ai/src/adapter.ts
index 66964c5339..3651eb566c 100644
--- a/packages/llm/llm-pi-ai/src/adapter.ts
+++ b/packages/llm/llm-pi-ai/src/adapter.ts
@@ -168,13 +168,24 @@ function reasoningInfo(
   }
 }
 
-/** Merge deployment headers while removing case-insensitive attribution collisions. */
-function requestHeaders(headers: Readonly<Record<string, string>> | undefined): Record<string, string> {
+/**
+ * Merge deployment headers while removing case-insensitive attribution
+ * collisions, then let the route's own identity replace the attribution UA.
+ * @param headers - the profile's deployment-owned request headers.
+ * @param userAgent - the route's wire `User-Agent`, replacing the shared
+ *   attribution UA for that route when configured.
+ * @returns the merged wire headers.
+ */
+function requestHeaders(
+  headers: Readonly<Record<string, string>> | undefined,
+  userAgent?: string,
+): Record<string, string> {
   const attribution = attributionHeaders()
   const reserved = new Set(Object.keys(attribution).map(name => name.toLowerCase()))
   return {
     ...Object.fromEntries(Object.entries(headers ?? {}).filter(([name]) => !reserved.has(name.toLowerCase()))),
     ...attribution,
+    ...userAgent === undefined ? {} : { 'user-agent': userAgent },
   }
 }
 
@@ -317,8 +328,9 @@ export class PiAiAdapter extends LlmAdapter {
         ...options.sessionId === undefined ? {} : { sessionId: String(options.sessionId) },
         signal: watchdog.signal,
         // Profile headers are deployment-owned; attribution names are
-        // Harness-owned and therefore win collisions.
-        headers: requestHeaders(profile.headers),
+        // Harness-owned and therefore win collisions. The route's own
+        // `userAgent` then replaces the attribution UA for that route.
+        headers: requestHeaders(profile.headers, profile.userAgent),
       })
       const iterator = toStreamChunks(events, model.contextWindow)[Symbol.asyncIterator]()
       let exhausted = false
diff --git a/packages/llm/llm-pi-ai/src/config.ts b/packages/llm/llm-pi-ai/src/config.ts
index 4e8e032df0..078abb4a74 100644
--- a/packages/llm/llm-pi-ai/src/config.ts
+++ b/packages/llm/llm-pi-ai/src/config.ts
@@ -122,6 +122,13 @@ export interface PiAiProviderProfile {
   defaultInput?: PiAiModality[]
   /** Provider request headers; Harness attribution wins reserved names. */
   headers?: Record<string, string>
+  /**
+   * Full wire `User-Agent` value for this route, replacing the shared
+   * harness attribution UA on requests this route sends. A deployment whose
+   * gateway routes on the client identity (white-label or otherwise) names
+   * its own UA here; routes without one keep the shared attribution.
+   */
+  userAgent?: string
   /** Provider-neutral pi-ai reasoning level. */
   reasoning?: ModelThinkingLevel
   /** Token budgets used by reasoning providers that support them. */
@@ -241,6 +248,7 @@ const profile = z.object({
   defaultMaxTokens: z.number().step(1).min(1).default(DEFAULT_MAX_TOKENS),
   defaultInput: z.array(z.union(MODALITIES)).default([...DEFAULT_INPUT]),
   headers: z.dict(z.string()),
+  userAgent: z.string(),
   reasoning: z.union(THINKING_LEVELS),
   thinkingBudgets,
   cacheRetention: z.union(['none', 'short', 'long']),
@@ -315,6 +323,9 @@ export function resolveProfiles(
     if (source.displayName !== undefined && source.displayName.length === 0) {
       throw new Error(`llm-pi-ai: provider "${provider}" has an empty displayName`)
     }
+    if (source.userAgent !== undefined && source.userAgent.length === 0) {
+      throw new Error(`llm-pi-ai: provider "${provider}" has an empty userAgent`)
+    }
     const streamIdleTimeoutMs = source.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS
     if (!Number.isFinite(streamIdleTimeoutMs)
       || streamIdleTimeoutMs <= 0
diff --git a/packages/llm/llm-pi-ai/tests/adapter.spec.ts b/packages/llm/llm-pi-ai/tests/adapter.spec.ts
index 51ce347e9a..fc3e31a36c 100644
--- a/packages/llm/llm-pi-ai/tests/adapter.spec.ts
+++ b/packages/llm/llm-pi-ai/tests/adapter.spec.ts
@@ -83,6 +83,17 @@ describe('PiAiAdapter provider routing', () => {
     expect(server.headers[0]?.['user-agent']).toBe(userAgent())
   })
 
+  it('replaces the attribution user agent with the route userAgent', async () => {
+    const server = await mockServer([{ events: textEvents }])
+    const ctx = await harness(server.url, {
+      headers: { 'x-company': 'private', 'User-Agent': 'wrong' },
+      userAgent: 'opencode',
+    })
+    await assemble(ctx, { model: 'deepseek-v4-flash', messages: [] })
+    expect(server.headers[0]?.['x-company']).toBe('private')
+    expect(server.headers[0]?.['user-agent']).toBe('opencode')
+  })
+
   it('forwards common stream options and profile reasoning', async () => {
     const server = await mockServer([{ events: textEvents }])
     const ctx = await harness(server.url, {
@@ -708,6 +719,7 @@ describe('provider profile lifecycle', () => {
     expect(() => resolveProfiles([{ provider: 'openai' }] as never)).toThrow(/dict keyed by provider/)
     expect(() => resolveProfiles({ openai: { provider: 'openai' } as never })).toThrow(/moved to the providers dict key/)
     expect(() => resolveProfiles({ openai: { baseURL: '' } })).toThrow(/empty baseURL/)
+    expect(() => resolveProfiles({ openai: { userAgent: '' } })).toThrow(/empty userAgent/)
     expect(() => resolveProfiles({ openai: { apiKeyEnv: 'not-a-var!' } })).toThrow(/must match/)
   })
 
-- 
2.54.0.windows.1


```

## 5. 构建（生成声明与 bundle）

```sh
pnpm run build:lib:host
```

## 6. 验证（全模型探测）

前提：`~/.dsh/settings.yaml` 已按公开方法仓库配置好 `opencode-zen` 路由（含 `userAgent: opencode`），`~/.dsh/.credentials.yaml` 已写入 `OPENCODE_ZEN_API_KEY`。

把下面 `ts` 代码块**原样完整**保存为仓库内文件 `packages/settings/settings-file/verify-zen.mts`，运行后删除：

```sh
pnpm exec tsx packages/settings/settings-file/verify-zen.mts
rm packages/settings/settings-file/verify-zen.mts
```

成功判据：每个模型一行，至少输出 `finish=stop:` 且有文本；`ERROR` 行为失败。注意：`finish=max-tokens:` 不是失败，是 `maxTokens` 给少了（推理型模型启动慢），把脚本里 `maxTokens: 64` 调大到 512 即可。

```ts
import { readFileSync } from 'node:fs'
import { parseDocument } from 'yaml'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { resolveProfiles } from '../../llm/llm-pi-ai/src/config.ts'
import { PiAiAdapter } from '../../llm/llm-pi-ai/src/adapter.ts'

const home = resolveDshHome()
const settings = parseDocument(readFileSync(`${home}/settings.yaml`, 'utf8')).toJSON() as {
  'llm-pi-ai': { providers: Record<string, Record<string, unknown>> }
}
const cred = parseDocument(readFileSync(`${home}/.credentials.yaml`, 'utf8')).toJSON() as Record<string, string>
const keyFor = (ref?: string): string | undefined => {
  if (ref === undefined) return undefined
  const envVal = process.env[ref]
  if (envVal !== undefined && envVal.length > 0) return envVal
  const stored = cred[ref]
  return typeof stored === 'string' && stored.length > 0 ? stored : undefined
}
const profile = settings['llm-pi-ai'].providers['opencode-zen']
if (profile === undefined) throw new Error('settings.yaml has no llm-pi-ai.providers.opencode-zen section')
const adapter = new PiAiAdapter({
  profiles: () => resolveProfiles({ 'opencode-zen': profile }),
  resolveApiKey: async (_provider, p) => keyFor(p.apiKeyEnv),
})
const models = (profile.models as { id: string }[]).map(m => m.id)
for (const model of models) {
  const started = Date.now()
  const text: string[] = []
  let finish = '(none)'
  try {
    for await (const chunk of adapter.stream({
      provider: 'opencode-zen', model,
      messages: [createUserMessage({ content: [{ type: 'text', text: 'Reply with exactly: OK' }], source: { kind: 'user' } })],
      maxTokens: 64,
    })) {
      if (chunk.type === 'text-delta') text.push(chunk.text)
      if (chunk.type === 'finish') finish = `${chunk.reason.kind}:${JSON.stringify(chunk.reason)}`
    }
    console.log(`${model} ${Date.now() - started}ms finish=${finish} text=${JSON.stringify(text.join(''))}`)
  } catch (error) {
    console.log(`${model} ERROR ${Date.now() - started}ms ${(error as Error).message}`)
  }
}
```

## 7. 升级路径（该改动合入正式发布后）

当 `feat(llm-pi-ai): allow a provider route to replace the attribution User-Agent` 已合入远程 master 并发布：

1. 第 4 步整个省略（仓库已含该能力）；
2. 其余步骤完全不变。

## 复现相关故障排查

| 现象 | 原因 | 处理 |
|---|---|---|
| `git apply --check` 报错 | 分支分叉 / 改动已存在 | 先 `git apply --3way`；仍失败则按第 7 节用合入版路径 |
| 校验报 `empty userAgent` | settings 里写了 `userAgent: ""` | 公开仓库 README 的配置里去掉空值；路由字段有意拒绝空串 |
| 某个模型 `ERROR` 且与其他模型不同 | 该模型在共享池/临时限流 | 稍后重跑；`finish=max-tokens` 则加大 maxTokens |
| `FreeUsageLimitError` | UA 仍非 `opencode`（配置问题） | 见公开方法仓库 README 的故障排查表 |

---

文件一致性：本文档内嵌补丁与仓库本地提交 `eb888cfdb8`（2026-08-17）对应；若你拿到的是更新版本，以更新版本为准。
