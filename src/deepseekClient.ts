import { CodeContext } from './completion';
import { CompletionError, endpoint, requestJson } from './httpClient';
import { PROVIDERS } from './providers';

export const DEEPSEEK_ENDPOINT = `${PROVIDERS.deepseek.baseUrl}/completions`;
export { CompletionError as DeepSeekError } from './httpClient';

export class DeepSeekClient {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async complete(
    context: CodeContext,
    options: { apiKey: string; model: string; maxTokens: number; baseUrl?: string },
    signal: AbortSignal,
  ): Promise<string> {
    const body = await requestJson(this.fetcher,
      endpoint(options.baseUrl ?? PROVIDERS.deepseek.baseUrl, 'completions'), options.apiKey, {
        model: options.model,
        prompt: context.prefix,
        suffix: context.suffix,
        max_tokens: options.maxTokens,
        temperature: 0,
        stream: false,
      }, signal, 'DeepSeek') as { choices?: Array<{ text?: unknown }> } | null;
    const completion = body?.choices?.[0]?.text;
    if (typeof completion !== 'string') {
      throw new CompletionError('DeepSeek 补全响应格式不正确。');
    }
    return completion;
  }
}
