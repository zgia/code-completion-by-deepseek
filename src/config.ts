import * as vscode from 'vscode';
import { Provider, PROVIDERS, REASONING_EFFORTS, ReasoningEffort } from './providers';

export interface Settings {
  enabled: boolean;
  provider: Provider;
  baseUrl: string;
  model: string;
  reasoningEffort: ReasoningEffort;
  languages: readonly string[];
  debounceMs: number;
  timeoutMs: number;
  maxTokens: number;
  maxLines: number;
}

export const DEFAULT_LANGUAGES = [
  'php', 'javascript', 'javascriptreact', 'typescript', 'typescriptreact', 'vue', 'json', 'jsonc',
] as const;

export function readSettings(document: vscode.TextDocument, environment: NodeJS.ProcessEnv = process.env): Settings {
  const config = vscode.workspace.getConfiguration('zgia.CodeCompletion', document.uri);
  // Ignore contributed defaults when resolving environment fallbacks.
  const explicit = (key: string): unknown => {
    const inspected = config.inspect<unknown>(key);
    return inspected && [
      inspected.globalValue, inspected.workspaceValue, inspected.workspaceFolderValue,
      inspected.globalLanguageValue, inspected.workspaceLanguageValue, inspected.workspaceFolderLanguageValue,
    ].some(value => value !== undefined) ? config.get<unknown>(key) : undefined;
  };
  const nonempty = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined;
  const integer = (key: string, fallback: number, min: number, max: number): number => {
    const value = config.get<unknown>(key);
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.min(max, Math.max(min, Math.floor(value))) : fallback;
  };
  const provider: Provider = config.get<unknown>('provider') === 'openai' ? 'openai' : 'deepseek';
  const defaults = PROVIDERS[provider];
  const model = nonempty(explicit(`${provider}.model`))
    ?? (provider === 'deepseek' ? nonempty(explicit('model')) : undefined)
    ?? nonempty(environment[defaults.environmentModel]) ?? defaults.model;
  const baseUrl = nonempty(explicit(`${provider}.baseUrl`))
    ?? nonempty(environment[defaults.environmentBaseUrl]) ?? defaults.baseUrl;
  const configuredEffort = nonempty(explicit('openai.reasoningEffort'))
    ?? nonempty(environment.OPENAI_REASONING_EFFORT) ?? 'default';
  const reasoningEffort: ReasoningEffort = provider === 'openai'
    && REASONING_EFFORTS.includes(configuredEffort as ReasoningEffort)
    ? configuredEffort as ReasoningEffort : 'default';
  const languages = config.get<unknown>('languages');
  return {
    enabled: config.get<boolean>('enabled', true),
    provider,
    baseUrl,
    model,
    reasoningEffort,
    languages: Array.isArray(languages)
      ? languages.filter((value): value is string => typeof value === 'string').map(value => value.trim()).filter(Boolean)
      : DEFAULT_LANGUAGES,
    debounceMs: integer('debounceMs', 200, 0, 2000),
    timeoutMs: integer('timeoutMs', 10000, 1000, 60000),
    maxTokens: integer('maxTokens', 128, 16, 1024),
    maxLines: integer('maxLines', 3, 1, 20),
  };
}
