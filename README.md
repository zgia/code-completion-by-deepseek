# Code Completion by AI

提供 VS Code 行内代码补全：停止输入后显示灰色建议，按 **Tab** 接受，按 **Esc** 关闭。也可通过 VS Code 自带的 “Trigger Inline Suggestion” 命令手动触发。使用官方稳定版 `registerInlineCompletionItemProvider` API。

支持两个服务商，可随时切换：

- **DeepSeek**：使用原生 FIM（Fill In the Middle）接口，发送光标前的 `prompt` 和光标后的 `suffix`，读取 `choices[0].text`。
- **OpenAI**：使用 Chat Completions 接口，将光标前后的代码作为上下文，要求模型仅输出光标处要插入的代码，读取 `choices[0].message.content`。这是通过提示词模拟中间补全，效果和延迟可能与原生 FIM 不同。

默认模型为 DeepSeek，设置前缀为 `zgia.CodeCompletion`。扩展标识为 `zgia.code-completion-by-ai`。

## 分别配置两个服务商

两家的密钥、模型、地址分别保存；切换只改变当前服务商。接口地址支持配置，使用官方服务时可省略。

| 环境变量 | 默认值 / 用途 |
| --- | --- |
| `DEEPSEEK_API_KEY` | DeepSeek 密钥 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com/beta` |
| `DEEPSEEK_MODEL` | `deepseek-flash`，必须支持 FIM |
| `OPENAI_API_KEY` | OpenAI 密钥 |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` |
| `OPENAI_MODEL` | `gpt-6.1-sol`，必须支持 Chat Completions |
| `OPENAI_REASONING_EFFORT` | `default`，沿用模型默认强度；`low` 对应轻度 |

macOS / Linux：

```sh
export DEEPSEEK_API_KEY='你的 DeepSeek API Key'
export OPENAI_API_KEY='你的 OpenAI API Key'

# 以下均可省略；仅在修改模型或使用兼容代理时配置。
export DEEPSEEK_BASE_URL='https://api.deepseek.com/beta'
export DEEPSEEK_MODEL='deepseek-flash'
export OPENAI_BASE_URL='https://api.openai.com/v1'
export OPENAI_MODEL='gpt-6.1-sol'

code /path/to/project
```

Windows PowerShell：

```powershell
$env:DEEPSEEK_API_KEY = '你的 DeepSeek API Key'
$env:OPENAI_API_KEY = '你的 OpenAI API Key'
$env:DEEPSEEK_BASE_URL = 'https://api.deepseek.com/beta'
$env:DEEPSEEK_MODEL = 'deepseek-flash'
$env:OPENAI_BASE_URL = 'https://api.openai.com/v1'
$env:OPENAI_MODEL = 'gpt-6.1-sol'
code C:\path\to\project
```

先完全退出所有 VS Code 窗口，再从已设置变量的终端启动，否则已有进程可能继承不到新变量。只在 VS Code 内置终端里设置变量不会更新已经运行的扩展宿主。Remote SSH / WSL / Dev Containers 下，应在远端扩展宿主环境配置这些变量并重启宿主。扩展不会加载 `.env` 文件。

模型与地址也可通过 VS Code 设置分别配置：

```json
{
  "zgia.CodeCompletion.provider": "openai",
  "zgia.CodeCompletion.deepseek.model": "deepseek-flash",
  "zgia.CodeCompletion.deepseek.baseUrl": "https://api.deepseek.com/beta",
  "zgia.CodeCompletion.openai.model": "gpt-6.1-sol",
  "zgia.CodeCompletion.openai.baseUrl": "https://api.openai.com/v1",
  "editor.inlineSuggest.enabled": true
}
```

**模型和地址的优先级：显式 VS Code 设置 → 对应服务商的环境变量 → 默认值。** 设置留空使用环境变量或默认值；设置界面仅展示默认值、没有显式保存时，不会覆盖环境变量。

`baseUrl` 是**基础地址**，不要填写完整请求路径。扩展自动追加：

- DeepSeek：`/completions`，默认完整地址 `https://api.deepseek.com/beta/completions`。
- OpenAI：`/chat/completions`，默认完整地址 `https://api.openai.com/v1/chat/completions`。

支持兼容上述请求格式的 HTTP(S) 代理。请求不跟随重定向；地址不能包含账号、密码、查询参数或片段。

## OpenAI 推理强度

例如，配置为 Codex 中的 **6.1 Sol + 轻度**：

```json
{
  "zgia.CodeCompletion.provider": "openai",
  "zgia.CodeCompletion.openai.model": "gpt-6.1-sol",
  "zgia.CodeCompletion.openai.reasoningEffort": "low"
}
```

或者通过环境变量（服务商仍在 VS Code 设置或命令中选择）：

```sh
export OPENAI_MODEL='gpt-6.1-sol'
export OPENAI_REASONING_EFFORT='low'
```

推理强度控制模型的思考投入，与模型名称、`temperature` 是不同参数。`gpt-6.1-sol` 支持 `low`（轻度）、`medium`（默认）、`high`、`xhigh`、`max`。其他模型支持的取值可能不同，非推理模型请保留 `default`。

优先级：显式 `openai.reasoningEffort` 设置 → `OPENAI_REASONING_EFFORT` → `default`。设置留空时使用环境变量；显式选择 `default` 会覆盖环境变量，并且不发送 `reasoning_effort` 参数，沿用模型自身默认值。此设置仅对 OpenAI 生效。修改 VS Code 设置立即生效并取消旧请求；修改环境变量需要重启扩展宿主。

`maxTokens` 同时限制推理和实际输出，默认 128 对推理模型可能不足。可尝试设为 1024，再根据真实请求效果调整模型和超时。

## 随时切换

在命令面板（macOS：Cmd+Shift+P；Windows/Linux：Ctrl+Shift+P）运行 **“Code Completion: 切换服务商”**，选择 **OpenAI** 或 **DeepSeek**。

也可直接修改 `zgia.CodeCompletion.provider` 为 `"openai"` 或 `"deepseek"`。**无需重启，下次补全立即使用新的服务商**。命令会修改当前文件所在的已有文件夹/工作区设置。

切换后若该服务商缺少密钥，会提示配置，不会自动使用另一家的密钥或接口。

## 安全保存 API Key

每家分别使用：**对应的 VS Code SecretStorage 密钥 → 对应的 API Key 环境变量 → 无密钥**。

运行 **“Code Completion: 设置 API Key”**，先选择服务商，再通过密码输入框保存。密钥加密保存，不参与 Settings Sync；修改后下次补全立即生效。可以为两家分别保存密钥，不需要为了配置另一家而切换当前服务商。

运行 **“Code Completion: 清除 API Key”**，选择要清除的服务商，之后自动使用该服务商的环境变量。取消选择或输入不会修改现有密钥，清除一家不影响另一家。

## 开发与安装

```sh
cd code-completion
npm ci
npm run lint
npm test
npm run package:vsix
code --install-extension code-completion-by-ai-a.b.c.vsix
```

开发调试时，用 VS Code 打开 `code-completion` 目录并按 **F5**。在新打开的扩展开发窗口编辑代码即可。

确保 `editor.inlineSuggest.enabled` 为 `true`。默认只在 PHP、JS/TS（含 React）、Vue、JSON/JSONC 中补全。Python 等其他语言需加入语言列表，例如：

```json
{
  "zgia.CodeCompletion.languages": ["php", "javascript", "typescript", "vue", "json", "python"]
}
```

设为 `["*"]` 可启用所有语言，设为 `[]` 则不请求补全。修改后无需重启。

多个行内补全扩展可能同时请求并显示建议。本扩展不会修改 Copilot 设置；如希望只使用本扩展，可在用户设置中关闭 Copilot，并保留 VS Code 的行内建议开关：

```json
{
  "github.copilot.enable": { "*": false },
  "github.copilot.nextEditSuggestions.enabled": false,
  "editor.inlineSuggest.enabled": true
}
```

也可以只关闭特定语言的 Copilot，例如 `"github.copilot.enable": { "php": false }`。

## 补全设置

| 设置（前缀 `zgia.CodeCompletion.`） | 默认值 | 用途 |
| --- | --- | --- |
| `enabled` | `true` | 开关 |
| `provider` | `deepseek` | 当前服务商：`deepseek` / `openai` |
| `deepseek.model` | `deepseek-flash` | 支持 FIM 的 DeepSeek 模型 |
| `deepseek.baseUrl` | `https://api.deepseek.com/beta` | DeepSeek 基础地址 |
| `openai.model` | `gpt-6.1-sol` | 支持 Chat Completions 的 OpenAI 模型 |
| `openai.baseUrl` | `https://api.openai.com/v1` | OpenAI 基础地址 |
| `openai.reasoningEffort` | `default` | OpenAI 推理强度；`low` 对应轻度 |
| `model` | `deepseek-flash` | 兼容旧版，仅对 DeepSeek 生效；建议改用 `deepseek.model` |
| `languages` | PHP、JS/TS（含 React）、Vue、JSON/JSONC | 允许补全的语言 ID；`["*"]` 表示全部 |
| `debounceMs` | `200` | 自动请求前等待时间 |
| `timeoutMs` | `10000` | 请求超时时间 |
| `maxTokens` | `128` | 生成 token 上限，可配置 16–1024 |
| `maxLines` | `3` | 显示行数上限 |

OpenAI 使用 `max_completion_tokens`，其中也包含推理 token。默认模型适合短补全；若自行选择推理模型，可能需要调大 `maxTokens` 和 `timeoutMs`。扩展不发送 `temperature` 等受部分推理模型限制的采样参数。模型是否可用取决于服务商及账号权限。

只发送当前文件光标附近的代码（前约 80 行、后约 20 行，总计最多 16,000 个字符），不扫描其他文件。新请求会取消同一文件的旧请求；取消、超时或文档版本变化时不显示过期建议。仅对当前行已有的闭合标点做重叠去重，保留可能有意义的标识符和换行。网络和接口错误可在“输出 → Code Completion”查看；输出不包含密钥和源代码。

`npm test` 包含真实本机 HTTP 服务测试，验证取消能从 VS Code token 传递到 fetch 连接，包括等待响应头和读取响应体阶段。测试使用虚构密钥和代码，不调用真实 DeepSeek 或 OpenAI 服务；还覆盖两家请求格式、配置优先级、密钥隔离和即时切换。

`npm run lint` 检查 TypeScript 源码、JavaScript 测试和 ESLint 配置，错误或警告都会使检查失败；`npm run lint:fix` 自动修复格式和未使用的导入。统一两空格缩进、单引号（避免转义时可用双引号）、分号、多行尾逗号和常用空格规则。打包前自动运行 lint，配置文件不进入 VSIX。

接口文档：[DeepSeek FIM（Beta）](https://api-docs.deepseek.com/api/create-completion)、[OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)。
