import * as vscode from 'vscode';
import { readSettings, Settings } from './config';
import { delay, normalizeCompletion, trimContext } from './completion';
import { CompletionClient } from './completionClient';
import { CompletionError } from './httpClient';
import { Provider, PROVIDERS } from './providers';

export class CompletionProvider implements vscode.InlineCompletionItemProvider, vscode.Disposable {
  private readonly requests = new Map<string, AbortController>();
  private readonly warnedMissingKeys = new Set<Provider>();
  private disposed = false;

  constructor(
    private readonly output: vscode.OutputChannel,
    private readonly client = new CompletionClient(),
    private readonly getSettings: (document: vscode.TextDocument) => Settings = readSettings,
    private readonly getApiKey: (provider: Provider) => string | undefined | Promise<string | undefined>
    = provider => process.env[PROVIDERS[provider].environmentKey],
  ) {}

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[]> {
    const key = document.uri.toString();
    this.requests.get(key)?.abort();
    const settings = this.getSettings(document);
    const settingsSignature = JSON.stringify(settings);
    const settingsChanged = (): boolean => JSON.stringify(this.getSettings(document)) !== settingsSignature;
    const service = PROVIDERS[settings.provider];
    if (this.disposed || !settings.enabled || token.isCancellationRequested || document.isClosed) {
      return [];
    }
    if (!settings.languages.includes('*') && !settings.languages.includes(document.languageId)) {
      return [];
    }
    // Let VS Code's normal suggestion widget finish before requesting ghost text.
    if (context.selectedCompletionInfo) {
      return [];
    }
    const version = document.version;
    const controller = new AbortController();
    this.requests.set(key, controller);
    const cancellation = token.onCancellationRequested(() => controller.abort());
    if (token.isCancellationRequested) {
      controller.abort();
    }
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const credential = this.getApiKey(settings.provider);
      const apiKey = (typeof credential === 'string' || credential === undefined
        ? credential : await credential)?.trim();
      controller.signal.throwIfAborted();
      if (document.version !== version || document.isClosed || this.disposed || settingsChanged()) {
        return [];
      }
      if (!apiKey) {
        if (!this.warnedMissingKeys.has(settings.provider)) {
          this.warnedMissingKeys.add(settings.provider);
          void vscode.window.showWarningMessage(
            `Code Completion：${service.label} 未配置密钥，请运行“设置 API Key”命令，或设置 ${service.environmentKey} 后重新启动 VS Code。`,
          );
        }
        return [];
      }
      this.warnedMissingKeys.delete(settings.provider);
      if (context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic) {
        await delay(settings.debounceMs, controller.signal);
      }
      controller.signal.throwIfAborted();
      if (document.version !== version || document.isClosed || settingsChanged()) {
        return [];
      }
      const offset = document.offsetAt(position);
      const prefix = document.getText(new vscode.Range(document.positionAt(Math.max(0, offset - 12000)), position));
      const suffix = document.getText(new vscode.Range(position, document.positionAt(offset + 4000)));
      const code = trimContext(prefix, suffix);
      if (!(code.prefix + code.suffix).trim()) {
        return [];
      }
      timeout = setTimeout(() => controller.abort(), settings.timeoutMs);
      const raw = await this.client.complete(code, {
        apiKey, provider: settings.provider, baseUrl: settings.baseUrl, model: settings.model, maxTokens: settings.maxTokens,
        reasoningEffort: settings.reasoningEffort,
      }, controller.signal);
      if (controller.signal.aborted || document.version !== version || document.isClosed || this.disposed || settingsChanged()) {
        return [];
      }
      const text = normalizeCompletion(raw, code, settings.maxLines);
      if (!text) {
        return [];
      }
      const insertion = document.eol === vscode.EndOfLine.CRLF ? text.replace(/\n/g, '\r\n') : text;
      return [new vscode.InlineCompletionItem(insertion, new vscode.Range(position, position))];
    } catch (error) {
      if (!controller.signal.aborted) {
        // Fetch errors can contain arbitrary data; report only safe known statuses.
        const message = error instanceof CompletionError
          ? error.message : `${service.label} 补全请求失败，请检查网络和 API Key。`;
        this.output.appendLine(message);
      }
      return [];
    } finally {
      clearTimeout(timeout);
      cancellation.dispose();
      if (this.requests.get(key) === controller) {
        this.requests.delete(key);
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    this.cancelPendingRequests();
  }

  cancelPendingRequests(): void {
    for (const request of this.requests.values()) {
      request.abort();
    }
    this.requests.clear();
  }
}
