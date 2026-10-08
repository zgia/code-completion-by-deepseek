export type Provider = 'deepseek' | 'openai';

export const REASONING_EFFORTS = ['default', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export type ReasoningEffort = typeof REASONING_EFFORTS[number];

export const PROVIDERS = {
  deepseek: {
    label: 'DeepSeek',
    environmentKey: 'DEEPSEEK_API_KEY',
    environmentBaseUrl: 'DEEPSEEK_BASE_URL',
    environmentModel: 'DEEPSEEK_MODEL',
    baseUrl: 'https://api.deepseek.com/beta',
    model: 'deepseek-flash',
  },
  openai: {
    label: 'OpenAI',
    environmentKey: 'OPENAI_API_KEY',
    environmentBaseUrl: 'OPENAI_BASE_URL',
    environmentModel: 'OPENAI_MODEL',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-6.1-sol',
  },
} as const;
