# `@deepseek-ai/dsh-llm-user-agent-override`

[English](README.md) | 中文

用于 pi-ai LLM 适配器接缝的路由级自定义 `User-Agent` 注入。

按客户端身份路由的网关（例如按调用产品区分流量的托管推理端点）需要每次 harness 请求在线上携带调用产品自身的 `User-Agent`。`llm-pi-ai` 适配器的 profile `userAgent` 字段已经按路由替换共享 attribution UA；本插件把同一能力做成独立的组合单元，部署方可以在调用旁边拥有这份映射，而不必改动 `llm-pi-ai` 的 settings section——同时它也是从 `llm/stream` waterfall 监听器绕过适配器的参考实现。

## 行为

- 命中路由（`routes[provider]`）：请求完全绕过 `pi-ai` 适配器。插件解析适配器本会读取的同一份 provider 配置，构建同一个 pi-ai provider 与模型描述符，并以 `headers: { 'user-agent': <value> }` 通过 pi-ai 直接流式传输。
- 未命中路由：`yield* next()`——请求落入 pi-ai 适配器，保留所有既有行为。
- 命中但 provider 配置无法解析的路由会以 `LlmError`（`NO_PROFILE`）响亮失败并指名路由。
- 空 `routes` 值在加载时被拒绝：线上出现空 `User-Agent` 绝非有意为之。

provider profile 来自 `llm-pi-ai` 的 settings section（适配器自身读取的来源），并以本插件的可选 `profiles` 字段作为回退——供希望把连接信息放在 override 旁边的部署，或供测试使用。

## 配置

```yaml
# cordis.yml
- id: llm-user-agent-override
  name: '@deepseek-ai/dsh-llm-user-agent-override'
  config:
    routes:
      open-code: opencode
```

```yaml
# ~/.dsh/settings.yaml — provider connection facts (may also live in the
# plugin's `profiles` field)
llm-pi-ai:
  providers:
    open-code:
      apiKeyEnv: OPEN_CODE_API_KEY
      baseURL: https://opencode.ai/zen/v1
      models:
        - id: big-pickle
```

## 模型体验

### 命中 override 的请求

#### 模型看到什么

模型收到与适配器为该路由本会发送的完全相同的 `system` prompt、历史、工具与采样字段；插件复用 `llm-pi-ai` 自身的 profile 解析器、context 转换与事件翻译。唯一差异是线缆上的 `User-Agent` 头。不添加任何 prompt 文本。本应能通过适配器到达模型、却无法到达的请求（profile 缺失、未知模型、凭据缺失）会以适配器自身的诊断失败并指名路由。

#### Token 影响

无变化：请求体与该路由经适配器发送的逐字节相同，因此 provider 的分词与转换开销不受影响。

#### KV Cache 影响

provider 侧缓存身份跟随请求体，而请求体未变；只有 `User-Agent` 头不同，provider 以内容而非客户端头作为 prompt 缓存的键。不引入任何额外失效。

### 未命中请求

#### 模型看到什么

插件不参与；请求原样流经下一个中间件。

#### Token 影响

无影响——插件既不检查也不触碰未命中请求，因此分词与转换开销不变。

#### KV Cache 影响

无影响——插件既不检查也不触碰未命中请求，因此 provider 侧缓存身份不变。

## 已知限制与后续工作

- override 通过 `llm-pi-ai` 声明的 `./src/*` 导出面复用其 profile 解析、pi-ai context 转换与事件翻译（这些 helper 有意不放在其包根），并在构建时打包进本插件自己的 lib，因此发布的产物不需要 `llm-pi-ai` 源码。文本与工具调用请求完全受支持。
- 图片输入经由同步的纯文本 context 转换处理；命中 override 路由的图片请求会以适配器常规的 `UNSUPPORTED_CONTENT` 诊断失败，因为未查阅持久附件存储。文本与工具调用请求完全受支持。
- 不传递 `stop` 序列（pi-ai 不支持），这与适配器自身的约定一致。