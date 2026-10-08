import { CodeContext } from './completion';
import { DeepSeekClient } from './deepseekClient';
import { OpenAIClient } from './openaiClient';
import { Provider, ReasoningEffort } from './providers';

export class CompletionClient {
  constructor(
    private readonly deepseek = new DeepSeekClient(),
    private readonly openai = new OpenAIClient(),
  ) {}

  complete(
    context: CodeContext,
    options: { apiKey: string; provider: Provider; baseUrl: string; model: string; maxTokens: number; reasoningEffort?: ReasoningEffort },
    signal: AbortSignal,
  ): Promise<string> {
    return this[options.provider].complete(context, options, signal);
  }
}
