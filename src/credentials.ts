import * as vscode from 'vscode';
import { Provider, PROVIDERS } from './providers';

export class Credentials {
  constructor(
    private readonly secrets: vscode.SecretStorage,
    private readonly environmentKey: (provider: Provider) => string | undefined
    = provider => process.env[PROVIDERS[provider].environmentKey],
  ) {}

  async getApiKey(provider: Provider = 'deepseek'): Promise<string | undefined> {
    const stored = (await this.secrets.get(`${provider}.apiKey`))?.trim();
    return stored || this.environmentKey(provider)?.trim() || undefined;
  }

  async setApiKey(value: string, provider: Provider = 'deepseek'): Promise<void> {
    const key = value.trim();
    if (!key) {
      throw new Error('API Key 不能为空。');
    }
    await this.secrets.store(`${provider}.apiKey`, key);
  }

  async clearApiKey(provider: Provider = 'deepseek'): Promise<void> {
    await this.secrets.delete(`${provider}.apiKey`);
  }
}

export function registerCredentialCommands(credentials: Credentials): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('zgia.CodeCompletion.setApiKey', async () => {
      const provider = await pickProvider('选择要设置密钥的服务商');
      if (!provider) {
        return;
      }
      const service = PROVIDERS[provider];
      const key = await vscode.window.showInputBox({
        title: `Code Completion: 设置 ${service.label} API Key`,
        prompt: `密钥保存到 VS Code SecretStorage，优先于 ${service.environmentKey}。`,
        password: true,
        ignoreFocusOut: true,
        validateInput: value => value.trim() ? undefined : 'API Key 不能为空。',
      });
      if (key === undefined || !key.trim()) {
        return;
      }
      try {
        await credentials.setApiKey(key, provider);
        void vscode.window.showInformationMessage(`${service.label} API Key 已保存，下次补全立即生效。`);
      } catch {
        void vscode.window.showErrorMessage(`${service.label} API Key 保存失败，请重试。`);
      }
    }),
    vscode.commands.registerCommand('zgia.CodeCompletion.clearApiKey', async () => {
      const provider = await pickProvider('选择要清除密钥的服务商');
      if (!provider) {
        return;
      }
      const service = PROVIDERS[provider];
      try {
        await credentials.clearApiKey(provider);
        void vscode.window.showInformationMessage(`已清除保存的 ${service.label} API Key；后续补全使用 ${service.environmentKey}。`);
      } catch {
        void vscode.window.showErrorMessage(`${service.label} API Key 清除失败，请重试。`);
      }
    }),
  ];
}

export async function pickProvider(title: string): Promise<Provider | undefined> {
  const selected = await vscode.window.showQuickPick([
    { label: 'DeepSeek', description: '原生 FIM 代码补全', provider: 'deepseek' as const },
    { label: 'OpenAI', description: 'Chat Completions 代码补全', provider: 'openai' as const },
  ], { title });
  return selected?.provider;
}
