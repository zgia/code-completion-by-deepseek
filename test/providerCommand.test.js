'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const commands = new Map();
let selection = 'openai';
let inspected = {};
let updates = [];
let failure = false;
const messages = [];
const uri = { path: '/test.ts' };
const vscode = {
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  commands: { registerCommand(id, action) { commands.set(id, action); return { dispose() { commands.delete(id); } }; } },
  window: {
    activeTextEditor: { document: { uri } },
    async showQuickPick(items) { return items.find(item => item.provider === selection); },
    showInformationMessage(message) { messages.push(message); },
    showErrorMessage(message) { messages.push(message); },
  },
  workspace: { getConfiguration(section, resource) {
    assert.equal(section, 'zgia.CodeCompletion');
    assert.equal(resource, uri);
    return {
      inspect() { return inspected; },
      async update(...args) {
        if (failure) throw new Error('private-settings-details');
        updates.push(args);
      },
    };
  } },
};
const originalLoad = Module._load;
Module._load = function(id, ...rest) { return id === 'vscode' ? vscode : originalLoad.call(this, id, ...rest); };
const { registerProviderCommand } = require('../out/providerCommand');
Module._load = originalLoad;

test('switch command updates effective configuration scope and respects cancellation', async () => {
  const registration = registerProviderCommand();
  try {
    for (const [values, target] of [[{}, 1], [{ workspaceValue: 'deepseek' }, 2], [{ workspaceValue: 'deepseek', workspaceFolderValue: 'deepseek' }, 3]]) {
      inspected = values;
      updates = [];
      selection = 'openai';
      await commands.get('zgia.CodeCompletion.switchProvider')();
      assert.deepEqual(updates, [['provider', 'openai', target]]);
    }
    selection = 'deepseek';
    await commands.get('zgia.CodeCompletion.switchProvider')();
    assert.deepEqual(updates[1], ['provider', 'deepseek', 3]);
    selection = undefined;
    await commands.get('zgia.CodeCompletion.switchProvider')();
    assert.equal(updates.length, 2);
    selection = 'openai';
    failure = true;
    await commands.get('zgia.CodeCompletion.switchProvider')();
    assert.ok(messages.at(-1).includes('切换服务商失败'));
    assert.ok(messages.every(message => !message.includes('private-settings-details')));
  } finally {
    registration.dispose();
  }
});
