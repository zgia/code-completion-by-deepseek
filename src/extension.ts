import * as vscode from 'vscode';
import { CompletionProvider } from './provider';
import { Credentials, registerCredentialCommands } from './credentials';
import { registerProviderCommand } from './providerCommand';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Code Completion');
  const credentials = new Credentials(context.secrets);
  const provider = new CompletionProvider(output, undefined, undefined, selected => credentials.getApiKey(selected));
  context.subscriptions.push(
    output,
    provider,
    ...registerCredentialCommands(credentials),
    registerProviderCommand(),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('zgia.CodeCompletion')) {
        provider.cancelPendingRequests();
      }
    }),
    context.secrets.onDidChange(event => {
      if (event.key === 'deepseek.apiKey' || event.key === 'openai.apiKey') {
        provider.cancelPendingRequests();
      }
    }),
    // Language filtering happens in the provider, so settings changes take
    // effect immediately without repeatedly registering the provider.
    vscode.languages.registerInlineCompletionItemProvider(
      [{ scheme: 'file' }, { scheme: 'untitled' }, { scheme: 'vscode-remote' }],
      provider,
    ),
  );
}
