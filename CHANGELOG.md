# Changelog

## 0.1.5

- 扩展名称改为 `code-completion-by-ai`，显示名称改为 Code Completion by AI。
- 更新调试配置和安装说明，保留 `zgia.CodeCompletion` 设置及命令前缀。

## 0.1.4

- 新增 OpenAI 推理强度设置 `openai.reasoningEffort` 和环境变量 `OPENAI_REASONING_EFFORT`。
- 轻度对应 `low`；默认不发送推理强度参数，保留模型默认行为，仅对 OpenAI 生效。
- 补充配置优先级、请求参数及实时强度切换的回归测试。

## 0.1.3

- 新增 OpenAI Chat Completions 行内补全，使用 OPENAI_API_KEY，与 DeepSeek 密钥独立保存。
- 为两个服务商分别配置模型与接口基础地址，支持环境变量及 VS Code 设置。
- 新增“切换服务商”命令，切换立即生效并取消旧请求；保留已有 DeepSeek 密钥与旧模型配置。
- 新增配置优先级、密钥隔离、OpenAI 请求格式、切换及 HTTP 取消测试。

## 0.1.1

- 可配置补全语言，默认 PHP、JS/TS（含 React）、Vue、JSON/JSONC；支持 `*` 和空列表。
- 默认防抖从 300ms 调整为 200ms，maxTokens 上限提高至 1024。
- API Key 使用 SecretStorage 优先、环境变量兜底；移除 settings.json 中的密钥配置，提供设置/清除密钥命令。
- 后缀去重限于当前行闭合标点，避免误删标识符和换行。
- 错误输出只接受客户端定义的安全错误，避免任意异常泄露私密内容。
- 补充 PHP、配置边界及真实 HTTP 连接取消测试。

## 0.1.0

- DeepSeek FIM 行内代码补全。
