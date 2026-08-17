# 在 dsh（DeepSeek Harness）中使用 OpenCode Zen 免费模型

一份在 DeepSeek Harness（`dsh`）里使用 [OpenCode Zen](https://opencode.ai/zen) 免费模型的分步方法。

> 本仓库**只是方法说明**：只含文档与配置片段，不发布任何 DeepSeek Harness 源码。

[English](README.md) · **中文**

## 一句话方案

```yaml
llm-pi-ai:
  providers:
    opencode-zen:
      apiKeyEnv: OPENCODE_ZEN_API_KEY
      displayName: OpenCode Zen
      api: openai-completions
      baseURL: https://opencode.ai/zen/v1
      userAgent: opencode   # 关键就在这一行
      models:
        - id: big-pickle
        - id: deepseek-v4-flash-free
        - id: hy3-free
        - id: laguna-s-2.1-free
        - id: mimo-v2.5-free
        - id: nemotron-3-ultra-free
        - id: nemotron-3.5-lightning-free
agent-default-model:
  provider: opencode-zen
  model: big-pickle
```

在 `llm-pi-ai` 的提供方路由上写上 `userAgent: opencode`，Zen 免费模型即可在 dsh 内使用。

## 背景

### 现象

dsh 调用 Zen 免费模型时报错：

```
FreeUsageLimitError: Rate limit exceeded. Please try again later.
```

通常只有**部分**免费模型失败、另一些正常，且失败集合随时间变化。

### 根因

OpenCode Zen 按 `User-Agent` 分流：

- `User-Agent: opencode` → **第一方池**，稳定服务免费模型。
- 其他任何 UA → **第三方共享池**，免费额度被耗尽后即报 `FreeUsageLimitError`。

DeepSeek Harness 会给每个提供方请求盖上自己的归因 `User-Agent`（`deepseek-harness/{version} (+https://github.com/deepseek-ai/deepseek-harness)`），并把提供方 `headers` 里的 `user-agent` 当作保留名剔除后再盖归因头。所以第一方池对 dsh 不可达，`headers: { 'user-agent': opencode }` 也无效——这是设计使然。

### 解法

`llm-pi-ai` 的提供方 profile 支持**路由级 `userAgent` 字段**：该路由完整的线上 `User-Agent`。它只替换该路由所发请求上的共享归因 UA：

- 合并顺序：profile 配置头（剔除归因保留名）→ 归因头 → 路由 `userAgent`
- 没有 `userAgent` 的路由保持强制归因不变
- 空值在 profile 校验处被拒绝，与 `baseURL`、`displayName` 相同
- 模型发现（`discoverModels`）不受影响——它属于配置面清单获取，不是模型服务请求

该能力来自 harness 源码中的提交 *`feat(llm-pi-ai): allow a provider route to replace the attribution User-Agent`*。本指南只描述接口与配置；如果你的构建早于该提交，需要在提供方 profile schema 上补一个可选 `userAgent` 字段并在归因头之后合并进请求头（接口级小改动，约十几行），或直接使用已含该能力的构建。

## 前置条件

| 项 | 要求 |
|---|---|
| dsh | 构建版本中 `llm-pi-ai` 的提供方 profile 支持 `userAgent` 字段 |
| Node.js / pnpm | 与你的 dsh 构建声明一致（`node ^22.19` / `>=24`，pnpm workspaces） |
| Zen API key | 来自你的 OpenCode 账号 |
| 网络 | 可访问 `opencode.ai` 与 npm 源 |
| Shell | bash 兼容 shell（刷新模型清单的命令用到 `sed`/`curl`） |

## 步骤

### 1. 获取 Zen API key

在 OpenCode 账号中获取。请保密，绝不提交进任何仓库。

### 2. 配置提供方路由

创建或编辑 dsh 用户配置。默认位置是 `~/.dsh/settings.yaml`（macOS/Linux）或 `%USERPROFILE%\.dsh\settings.yaml`（Windows）；需要时可用环境变量 `DSH_HOME` 覆盖。

```yaml
llm-pi-ai:
  providers:
    opencode-zen:
      apiKeyEnv: OPENCODE_ZEN_API_KEY
      displayName: OpenCode Zen
      api: openai-completions
      baseURL: https://opencode.ai/zen/v1
      userAgent: opencode
      models:
        - id: big-pickle
        - id: deepseek-v4-flash-free
        - id: hy3-free
        - id: laguna-s-2.1-free
        - id: mimo-v2.5-free
        - id: nemotron-3-ultra-free
        - id: nemotron-3.5-lightning-free
```

**`userAgent: opencode` 是关键行。** 删掉它，请求就退回第三方共享池、`FreeUsageLimitError` 复现。如果之前残留过 `headers: { 'user-agent': ... }` 配置，请一并删掉——它无效且只会添乱。

### 3. 设置默认模型

```yaml
agent-default-model:
  provider: opencode-zen
  model: big-pickle
```

### 4. 存放 API key

`~/.dsh/.credentials.yaml`（收紧权限，绝不提交或外传）：

```yaml
OPENCODE_ZEN_API_KEY: sk-你的真实key
```

`apiKeyEnv` 的解析链：先读环境变量，再读此文件。

### 5. 验证

```sh
pnpm dsh --profile headless "Reply with exactly: PONG"
```

预期 stdout 打印 `PONG`、退出码 `0`。若出现 `FreeUsageLimitError`，见下方故障排查表。

### 6. 刷新免费模型清单

Zen 会增删模型。用你的 key 拉取并过滤：

```sh
KEY=$(sed -n 's/^OPENCODE_ZEN_API_KEY: //p' ~/.dsh/.credentials.yaml)
curl -sS -H "Authorization: Bearer $KEY" https://opencode.ai/zen/v1/models \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const m of JSON.parse(s).data)if(m.id.endsWith("-free")||m.id==="big-pickle")console.log(m.id)})'
```

把输出的 id 同步进 `settings.yaml` 的 `models:` 列表，保留 `- id: <id>` 格式。

## 免费模型

免费集合 = `big-pickle` + 各 `*-free` id。截至 2026-08-17：

| id | 说明 |
|---|---|
| `big-pickle` | 上面用作默认模型 |
| `deepseek-v4-flash-free` | |
| `hy3-free` | |
| `laguna-s-2.1-free` | |
| `mimo-v2.5-free` | 推理慢型，请给足 `max_tokens` |
| `nemotron-3-ultra-free` | |
| `nemotron-3.5-lightning-free` | 推理慢型，请给足 `max_tokens` |

以第 6 步拉到的实时清单为准。

## 使用提示

- `mimo-v2.5-free`、`nemotron-3.5-lightning-free` 是推理慢型，`max_tokens` 给太少会被提前截断（`finish=max-tokens`）。请给 `max_tokens > 256`。
- Web 界面模型选择器按 `settings.yaml` 里的 `models` 渲染；新增 id 在重启后出现。

## 故障排查

| 现象 | 原因 | 处理 |
|---|---|---|
| `FreeUsageLimitError` | UA 不是 `opencode` | 确认 `userAgent: opencode` 存在、删除旧的 `headers: { 'user-agent': ... }`，重启进程让配置生效 |
| 个别模型报错、其他正常 | 共享池压力 / 临时限流 | 稍后重试；若失败为 `finish=max-tokens`，调大 `max_tokens` |
| `dsh web` 报 `MissingClientBundleError` | Web 前端 bundle 未构建 | `pnpm run build:lib:client && pnpm run build:web` 后重启 |

## 替代方案：`llm-user-agent-override` 插件

`userAgent: opencode` 字段是在你持有 settings 时的"一行方案"。配套的 **[`llm-user-agent-override` 插件](PLUGIN.zh-CN.md)** 把同一个 wire 结果做成一个独立的**随插随弃组合单元**：它注册一个 `llm/stream` waterfall 监听器，按配置的路由注入自定义 `User-Agent`（`routes: { opencode-zen: opencode }`），其余路由 `yield* next()` 原样放行——内核零改动，没有它项目照常运行。

适合：映射想跟着调用方代码走、不能动 `llm-pi-ai` settings 文档、或想要一个"从 waterfall 绕过适配器"的工作参考。包在 [`packages/llm/llm-user-agent-override/`](packages/llm/llm-user-agent-override/)（照抄进你 dsh clone 的 `packages/llm/` 即可），完整安装/挂载/卸载/验证步骤与环境依赖清单见 [`PLUGIN.zh-CN.md`](PLUGIN.zh-CN.md)（[English](PLUGIN.md)）。

## Web 界面（可选）

```sh
pnpm run build:lib:client && pnpm run build:web
pnpm dsh web
```

打开 <http://127.0.0.1:3080>，在模型选择器里选任意免费模型即可对话。

## 许可与声明

本文档是社区方法整理，与 DeepSeek Harness、OpenCode Zen 项目无关联、亦未获其背书。它不发布任何 harness 源码——只有配置片段与接口级描述。模型可用性、配额策略与价格以各提供方自身条款为准。
