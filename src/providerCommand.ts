import * as vscode from 'vscode';
import { pickProvider } from './credentials';
import { PROVIDERS } from './providers';

export function registerProviderCommand(): vscode.Disposable {
  return vscode.commands.registerCommand('zgia.CodeCompletion.switchProvider', async () => {
    const uri = vscode.window.activeTextEditor?.document.uri;
    const config = vscode.workspace.getConfiguration('zgia.CodeCompletion', uri);
    const selected = await pickProvider('切换代码补全服务商');
    if (!selected) {
      return;
    }
    // Update the effective scope so an existing workspace setting cannot hide the switch.
    const inspected = config.inspect('provider');
    const target = inspected?.workspaceFolderValue !== undefined ? vscode.ConfigurationTarget.WorkspaceFolder
      : inspected?.workspaceValue !== undefined ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
    try {
      await config.update('provider', selected, target);
      void vscode.window.showInformationMessage(`代码补全已切换到 ${PROVIDERS[selected].label}，立即生效。`);
    } catch {
      void vscode.window.showErrorMessage('切换服务商失败，请在设置中修改 zgia.CodeCompletion.provider。');
    }
  });
}
