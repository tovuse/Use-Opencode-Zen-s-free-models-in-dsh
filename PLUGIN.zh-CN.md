# `llm-user-agent-override` 插件

一个**随插随弃**的组合单元（composition unit）：为 DeepSeek Harness 请求注入**路由级自定义
`User-Agent`**——与 [README.zh-CN.md](README.zh-CN.md) 里 `userAgent: opencode` 原生字段方案
对应的"插件版"。

> 它与主线方案并存而非替代：原生字段是一行配置；本插件把同一个 wire 结果做成独立、可拆、跟随调用方
> 的单元。

[English](PLUGIN.md) · **中文**

## 一句话方案

```yaml
# harness 组合里插入一行（patch overlay 或直接进 cordis.yml）
- insert:
    - id: llm-user-agent-override
      name: '@deepseek-ai/dsh-llm-user-agent-override'
      config:
        routes:
          opencode-zen: opencode   # provider 路由 → wire User-Agent
```

命中 `opencode-zen` 路由的请求，wire 上就是 `User-Agent: opencode`——这正是 OpenCode Zen 把流量
路由进 first-party 池的关键；其余路由 `yield* next()` 原样放行，零影响。

## 背景：为什么需要这个插件

[README.zh-CN.md](README.zh-CN.md#背景) 里的根因：OpenCode Zen **按 `User-Agent` 分流**。
`User-Agent: opencode` 进 first-party 池（免费模型稳定可用）；其他任何 UA 进共享第三方池
（额度常被耗尽）——这就是你看到的 `FreeUsageLimitError`。

DeepSeek Harness 每次 provider 请求都带自己的 attribution UA，且把 provider `headers` 里的
`user-agent` 视为保留名（设计上会被滤掉）。所以对一个路由修 wire UA，有两条通路：

| | 原生字段 | 本插件 |
|---|---|---|
| 改动 | `llm-pi-ai` settings 段里加一行 | 组合里加一行 + 放一个包 |
| wire 结果 | 该路由 `userAgent: opencode` | 该路由 `headers: { 'user-agent': <值> }` |
| 归属 | dsh 的 settings 文档 | 组合（或 `--patch` overlay） |
| 是否依赖 profile `userAgent` 字段 | 是（新版 build） | 否——拦截 `llm/stream` 实现 |
| dsh 内核改动 | 上游 feature commit | 零改动，仅由插件包运行 |

选择建议：自己持有 settings、只想要一行 → 用原生字段；想让映射跟着调用方代码走、不能动 settings、
或想有一个"从 `llm/stream` waterfall 绕过适配器"的工作参考 → 用本插件。

## 解决思路

- 插件在 `llm/stream` 事件上注册一个 **waterfall 监听器**（`ctx.on('llm/stream', …)`），不修改
  `agent-loop`、`LlmRuntime` 或 pi-ai 适配器——内核零改动，这也是它可以安全卸载的原因。
- 命中路由（`config.routes[provider]`）：解析与适配器相同的 provider 配置，构造相同的 pi-ai
  provider 与模型描述符，直接以 `headers: { 'user-agent': <值> }` 通过 pi-ai 流式请求——
  仅该请求绕过适配器。
- 未命中路由：`yield* next()`，请求逐字节原样流过。
- 复用不重造：`resolveProfiles` / `toPiContext` / `toStreamChunks` 从
  `@deepseek-ai/dsh-llm-pi-ai/src/*` 复用并在构建期内联（`deps.alwaysBundle`），产物自包含，
  不破坏 llm-pi-ai 的包根契约。

## 环境依赖

| 项 | 要求 |
|---|---|
| dsh 工作区 | [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 的 clone，已 `pnpm install`（插件放在 `packages/llm/` 下） |
| Node.js | `^22.19` 或 `>=24`（dsh 声明范围） |
| pnpm | 你的 dsh 工作区所用的版本 |
| peer 包（由工作区提供） | `@deepseek-ai/dsh-llm-pi-ai`、`@deepseek-ai/dsh-llm`、`@deepseek-ai/dsh-settings`、`@deepseek-ai/dsh-credentials`、`@deepseek-ai/dsh-launch-environment`、`@earendil-works/pi-ai`、`@deepseek-ai/schemastery`、`@deepseek-ai/cordis` |
| 构建 | `pnpm run build:lib:host`（跑 web profile 还需 `build:lib:client` + `build:web`） |
| Zen API key | OpenCode 账号签发，存入 `$DSH_HOME/.credentials.yaml`（绝不提交） |
| 网络 | 可达 `opencode.ai` 与 npm registry |

## 安装与挂载

### 1. 把包放进工作区

```sh
cp -r packages/llm/llm-user-agent-override <你的-dsh-clone>/packages/llm/
```

### 2. 接上 workspace 类型解析（两行）

`tsconfig.base.json` 的 `paths`，紧挨现有 `dsh-llm-pi-ai` 条目：

```jsonc
"@deepseek-ai/dsh-llm-user-agent-override/src/*": ["./packages/llm/llm-user-agent-override/src/*"]
```

`tsconfig.host.json` 的 `references`，紧挨 `./packages/llm/llm-pi-ai`：

```jsonc
{ "path": "./packages/llm/llm-user-agent-override" }
```

### 3. 让包在运行时可被解析

Loader 从 `apps/cli/node_modules/@deepseek-ai/` 解析组合里的包名，pnpn workspace 同形态软链即可：

```sh
ln -s ../../../../packages/llm/llm-user-agent-override \
  apps/cli/node_modules/@deepseek-ai/dsh-llm-user-agent-override
```

（`pnpm install` 可能清理手动软链；要一劳永逸就把包加进某个 bundle 的 `dependencies` 并重装。）

### 4. 挂载（patch overlay 或 cordis.yml）

```yaml
- insert:
    - id: llm-user-agent-override
      name: '@deepseek-ai/dsh-llm-user-agent-override'
      config:
        routes:
          opencode-zen: opencode
```

```sh
pnpm dsh --profile web --patch ./llm-uao-patch.yml --port 3081
```

`--patch` 是 launcher flag，必须出现在 web app 自己认领的第一个参数（`--port`）之前；
放在 `--port` 之后会报 `unknown option '--patch'`。

provider 连接信息来自 `llm-pi-ai` 的 settings 段（适配器自身读取的同一来源），或插件自己的
`profiles` 兜底字段——两者都有时 settings 优先。

## 卸载

三选一，重启后恢复原行为、无残留钩子：

1. 删除组合行（或 `--patch` 文件）；
2. 行内加 `disabled: true`；
3. 删除 `apps/cli/node_modules` 里的软链。

未命中路由与无插件不可区分：wire UA 回到 harness attribution（`deepseek-harness/{version} (+…)`）。

## 配置语义与行为

- `routes: Record<provider, ua>`——provider 路由到 wire UA 的映射。**空字符串**在加载期被拒
  （`BAD_CONFIG`，线上空 UA 绝非有意为之）。
- `profiles?: Record<provider, PiAiProviderProfile>`——连接信息兜底（测试/独立部署用）；
  `llm-pi-ai` settings 优先。
- 命中路由在以下情况响亮失败（`LlmError` 指名路由/模型）：provider 配置不可解析（`NO_PROFILE`）、
  模型不在 profile（`UNKNOWN_MODEL`）、凭证缺失（`MISSING_CREDENTIAL`）。
- 已知限制：图片输入走同步纯文本 context 转换（适配器常规 `UNSUPPORTED_CONTENT`）；`stop`
  序列不传递（pi-ai 不支持）。

## 验证

单元测试（mock server 断言 wire UA）：

```sh
pnpm vitest run packages/llm/llm-user-agent-override
```

headless 端到端（本地 UA 回显网关）：

```sh
DSH_HOME=/tmp/dsh-demo UA_TEST_KEY=test DEEPSEEK_API_KEY=x \
  pnpm dsh --profile headless --patch ./llm-uao-patch.yml \
  --patch ./llm-default-model.yml "请只回复：OK"
# 回复回显 wire UA：命中路由 = opencode；未命中 = deepseek-harness/0.1.0-rc.5 (+https://github.com/deepseek-ai/deepseek-harness)
```

或 3081 web UI：选 `OpenCode Zen` 下任一模型（默认 `big-pickle`）发消息，从回复回显或网关日志
看 `opencode` UA。

## 免费模型

与 [README.zh-CN.md](README.zh-CN.md#免费模型) 相同：`big-pickle` + 所有 `*-free` id。
用 [刷新命令](README.zh-CN.md#6-刷新免费模型列表) 获取权威最新列表（Zen 会随时间增删模型）。

## 附录：命令

```sh
pnpm run build:lib:host && pnpm run build:lib:client && pnpm run build:web
pnpm vitest run packages/llm/llm-user-agent-override

# 挂载并运行（launcher flag 在前）
DSH_HOME=/tmp/dsh-demo pnpm dsh --profile web --patch ./llm-uao-patch.yml --port 3081

# 查看组合树
pnpm dsh --profile web --patch ./llm-uao-patch.yml --dump-config \
  | grep llm-user-agent-override

# 卸载
rm apps/cli/node_modules/@deepseek-ai/dsh-llm-user-agent-override
```