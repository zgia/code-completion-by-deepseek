'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
let input;
let inputOptions;
let selection = 'deepseek';
const commands = new Map();
const messages = [];
const vscode = {
  commands: { registerCommand(id, action) { commands.set(id, action); return { dispose() { commands.delete(id); } }; } },
  window: {
    async showQuickPick(items) { return items.find(item => item.provider === selection); },
    async showInputBox(options) { inputOptions = options; return input; },
    showInformationMessage(message) { messages.push(message); },
    showErrorMessage(message) { messages.push(message); },
  },
};
const originalLoad = Module._load;
Module._load = function(id, ...rest) { return id === 'vscode' ? vscode : originalLoad.call(this, id, ...rest); };
const { Credentials, registerCredentialCommands } = require('../out/credentials');
Module._load = originalLoad;

function setup(environment = ' env-key ') {
  const values = new Map();
  const secrets = {
    async get(key) { return values.get(key); },
    async store(key, value) { values.set(key, value); },
    async delete(key) { values.delete(key); },
  };
  return { values, secrets, credentials: new Credentials(secrets, () => environment) };
}

test('SecretStorage precedes environment; clearing and blank stored keys fall back', async () => {
  const { credentials, values } = setup();
  assert.equal(await credentials.getApiKey(), 'env-key');
  await credentials.setApiKey(' stored-key ');
  assert.equal(await credentials.getApiKey(), 'stored-key');
  await credentials.clearApiKey();
  assert.equal(await credentials.getApiKey(), 'env-key');
  values.set('deepseek.apiKey', ' ');
  assert.equal(await credentials.getApiKey(), 'env-key');
  assert.equal(await setup(' ').credentials.getApiKey(), undefined);
  await assert.rejects(credentials.setApiKey(' '), /不能为空/);
});

test('password command saves a trimmed key; cancellation and blank input preserve it', async () => {
  const { credentials } = setup();
  const registrations = registerCredentialCommands(credentials);
  input = ' command-key ';
  await commands.get('zgia.CodeCompletion.setApiKey')();
  assert.equal(inputOptions.password, true);
  assert.equal(inputOptions.validateInput(' '), 'API Key 不能为空。');
  assert.equal(await credentials.getApiKey(), 'command-key');
  for (const value of [undefined, ' ']) {
    input = value;
    await commands.get('zgia.CodeCompletion.setApiKey')();
    assert.equal(await credentials.getApiKey(), 'command-key');
  }
  await commands.get('zgia.CodeCompletion.clearApiKey')();
  assert.equal(await credentials.getApiKey(), 'env-key');
  assert.ok(messages.every(message => !message.includes('command-key')));
  registrations.forEach(registration => registration.dispose());
  assert.equal(commands.size, 0);
});

test('storage command failures do not expose credentials or arbitrary error details', async () => {
  const { credentials, secrets } = setup();
  secrets.store = async () => { throw new Error('private-key storage details'); };
  secrets.delete = async () => { throw new Error('private-key storage details'); };
  const registrations = registerCredentialCommands(credentials);
  input = 'private-key';
  await commands.get('zgia.CodeCompletion.setApiKey')();
  await commands.get('zgia.CodeCompletion.clearApiKey')();
  assert.ok(messages.every(message => !message.includes('private-key')));
  registrations.forEach(registration => registration.dispose());
});

test('provider credentials are isolated and preserve the existing DeepSeek storage key', async () => {
  const { secrets, values } = setup();
  const credentials = new Credentials(secrets, provider => `${provider}-env`);
  values.set('deepseek.apiKey', 'existing-deepseek');
  assert.equal(await credentials.getApiKey('deepseek'), 'existing-deepseek');
  assert.equal(await credentials.getApiKey('openai'), 'openai-env');
  await credentials.setApiKey('openai-stored', 'openai');
  assert.equal(await credentials.getApiKey('openai'), 'openai-stored');
  await credentials.clearApiKey('openai');
  assert.equal(await credentials.getApiKey('openai'), 'openai-env');
  assert.equal(await credentials.getApiKey('deepseek'), 'existing-deepseek');
});

test('commands can manage OpenAI keys without altering DeepSeek; provider cancellation does nothing', async () => {
  const { credentials, values } = setup();
  await credentials.setApiKey('deepseek-stored');
  const registrations = registerCredentialCommands(credentials);
  try {
    selection = 'openai';
    input = 'openai-command-key';
    await commands.get('zgia.CodeCompletion.setApiKey')();
    assert.ok(inputOptions.prompt.includes('OPENAI_API_KEY'));
    assert.equal(await credentials.getApiKey('openai'), 'openai-command-key');
    selection = undefined;
    await commands.get('zgia.CodeCompletion.clearApiKey')();
    assert.equal(values.get('openai.apiKey'), 'openai-command-key');
    selection = 'openai';
    await commands.get('zgia.CodeCompletion.clearApiKey')();
    assert.equal(values.has('openai.apiKey'), false);
    assert.equal(await credentials.getApiKey('deepseek'), 'deepseek-stored');
  } finally {
    selection = 'deepseek';
    registrations.forEach(registration => registration.dispose());
  }
});
