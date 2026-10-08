'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { DeepSeekClient } = require('../out/deepseekClient');
const { deferred, openServer } = require('./helpers/httpServer');
const warnings = [];
class Position { constructor(line, character) { this.line = line; this.character = character; } }
class Range { constructor(start, end) { this.start = start; this.end = end; } }
class InlineCompletionItem { constructor(insertText, range) { this.insertText = insertText; this.range = range; } }
const vscode = {
  Position, Range, InlineCompletionItem,
  InlineCompletionTriggerKind: { Automatic: 0, Invoke: 1 },
  EndOfLine: { LF: 1, CRLF: 2 },
  window: { showWarningMessage: message => { warnings.push(message); return Promise.resolve(); } },
};
const originalLoad = Module._load;
Module._load = function (id, ...rest) {
  return id === 'vscode' ? vscode : originalLoad.call(this, id, ...rest);
};
const { CompletionProvider } = require('../out/provider');
Module._load = originalLoad;

function document(text = 'const answer = ;') {
  return {
    uri: { toString: () => 'file:///test.ts' }, version: 1, isClosed: false, eol: 1, languageId: 'typescript',
    offsetAt: position => position.character,
    positionAt: offset => new Position(0, Math.min(text.length, offset)),
    getText: range => text.slice(range.start.character, range.end.character),
  };
}
function token(cancelled = false) {
  const listeners = new Set();
  return {
    isCancellationRequested: cancelled,
    onCancellationRequested(listener) { listeners.add(listener); return { dispose: () => listeners.delete(listener) }; },
    cancel() { this.isCancellationRequested = true; for (const listener of listeners) listener(); },
    listeners,
  };
}
const position = new Position(0, 15);
const invoke = { triggerKind: 1 };
function setup(client, overrides = {}, key = () => 'test-key') {
  const logs = [];
  const settings = { enabled: true, provider: 'deepseek', baseUrl: 'https://api.deepseek.com/beta', model: 'deepseek-flash', languages: ['typescript'], debounceMs: 0, timeoutMs: 1000, maxTokens: 128, maxLines: 3, ...overrides };
  return { provider: new CompletionProvider({ appendLine: message => logs.push(message) }, client, () => settings, key), logs, settings };
}
function controlledClient() {
  const calls = [];
  return {
    calls, complete(_code, _options, signal) {
      return new Promise(resolve => calls.push({ signal, resolve }));
    },
  };
}

test('provider -> real client -> FIM response produces ghost text at the cursor', async () => {
  const client = new DeepSeekClient(async (_url, init) => {
    assert.equal(JSON.parse(init.body).prompt, 'const answer = ');
    assert.equal(JSON.parse(init.body).suffix, ';');
    return Response.json({ choices: [{ text: '42;' }] });
  });
  const { provider } = setup(client);
  const cancellation = token();
  const items = await provider.provideInlineCompletionItems(document(), position, invoke, cancellation);
  assert.equal(items.length, 1);
  assert.equal(items[0].insertText, '42');
  assert.equal(items[0].range.start, position);
  assert.equal(items[0].range.end, position);
  assert.equal(cancellation.listeners.size, 0);
  provider.dispose();
});

test('asynchronous credential reads cannot start stale or superseded network requests', async () => {
  const credentials = [];
  let calls = 0;
  const { provider } = setup({
    async complete(_code, options) {
      calls++;
      assert.equal(options.apiKey, 'new-key');
      return '42';
    },
  }, {}, () => new Promise(resolve => credentials.push(resolve)));
  const doc = document();
  const first = provider.provideInlineCompletionItems(doc, position, invoke, token());
  const second = provider.provideInlineCompletionItems(doc, position, invoke, token());
  credentials[0]('old-key');
  credentials[1]('new-key');
  assert.deepEqual(await first, []);
  assert.equal((await second)[0].insertText, '42');
  const third = provider.provideInlineCompletionItems(doc, position, invoke, token());
  doc.version++;
  credentials[2]('old-key');
  assert.deepEqual(await third, []);
  assert.equal(calls, 1);
  provider.dispose();
});

test('new requests cancel older ones and old responses cannot appear', async () => {
  const client = controlledClient();
  const { provider } = setup(client);
  const doc = document();
  const first = provider.provideInlineCompletionItems(doc, position, invoke, token());
  const second = provider.provideInlineCompletionItems(doc, position, invoke, token());
  assert.equal(client.calls[0].signal.aborted, true);
  client.calls[0].resolve('old');
  client.calls[1].resolve('new');
  assert.deepEqual(await first, []);
  assert.equal((await second)[0].insertText, 'new');
  provider.dispose();
});

test('edits, closing documents, token cancellation and disposal suppress stale results', async () => {
  for (const change of [(doc) => doc.version++, (doc) => doc.isClosed = true,
    (_doc, cancellation) => cancellation.cancel(), (_doc, _token, provider) => provider.dispose()]) {
    const client = controlledClient();
    const { provider } = setup(client);
    const doc = document();
    const cancellation = token();
    const pending = provider.provideInlineCompletionItems(doc, position, invoke, cancellation);
    change(doc, cancellation, provider);
    client.calls[0].resolve('outdated');
    assert.deepEqual(await pending, []);
    assert.equal(cancellation.listeners.size, 0);
    provider.dispose();
  }
});

test('timeout aborts the network request and returns no suggestion', async () => {
  let signal;
  const { provider, logs } = setup({
    complete(_code, _options, requestSignal) {
      signal = requestSignal;
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    },
  }, { timeoutMs: 10 });
  assert.deepEqual(await provider.provideInlineCompletionItems(document(), position, invoke, token()), []);
  assert.equal(signal.aborted, true);
  assert.deepEqual(logs, []);
  provider.dispose();
});

test('automatic debounce cancellation prevents API calls; manual invocation skips debounce', async () => {
  let calls = 0;
  const { provider } = setup({ async complete() { calls++; return '42'; } }, { debounceMs: 10000 });
  const cancellation = token();
  const pending = provider.provideInlineCompletionItems(document(), position, { triggerKind: 0 }, cancellation);
  cancellation.cancel();
  assert.deepEqual(await pending, []);
  assert.equal(calls, 0);
  assert.equal((await provider.provideInlineCompletionItems(document(), position, invoke, token()))[0].insertText, '42');
  provider.dispose();
});

test('missing key warns once, disabled/empty/selected/cancelled contexts make no API calls', async () => {
  let calls = 0;
  const client = { async complete() { calls++; return '42'; } };
  const { provider } = setup(client, {}, () => ' ');
  const before = warnings.length;
  await provider.provideInlineCompletionItems(document(), position, invoke, token());
  await provider.provideInlineCompletionItems(document(), position, invoke, token());
  assert.equal(warnings.length - before, 1);
  provider.dispose();
  const configured = setup(client);
  configured.settings.enabled = false;
  await configured.provider.provideInlineCompletionItems(document(), position, invoke, token());
  configured.settings.enabled = true;
  await configured.provider.provideInlineCompletionItems(document(''), new Position(0, 0), invoke, token());
  await configured.provider.provideInlineCompletionItems(document(), position, { ...invoke, selectedCompletionInfo: {} }, token());
  await configured.provider.provideInlineCompletionItems(document(), position, invoke, token(true));
  assert.equal(calls, 0);
  configured.provider.dispose();
});

test('preserves CRLF and does not expose unexpected error details', async () => {
  const doc = document();
  doc.eol = 2;
  const { provider, logs } = setup({ async complete() { return '42\nnext'; } });
  assert.equal((await provider.provideInlineCompletionItems(doc, position, invoke, token()))[0].insertText, '42\r\nnext');
  provider.dispose();
  const failed = setup({ async complete() { throw new Error('test-key private source'); } });
  assert.deepEqual(await failed.provider.provideInlineCompletionItems(document(), position, invoke, token()), []);
  assert.equal(failed.logs.length, 1);
  assert.ok(!failed.logs[0].includes('test-key'));
  assert.ok(!failed.logs[0].includes('private source'));
  assert.deepEqual(logs, []);
  failed.provider.dispose();
});

test('language allowlist is applied before credentials or network, with live wildcard and empty-list changes', async () => {
  let calls = 0;
  let credentialReads = 0;
  const { provider, settings } = setup({ async complete() { calls++; return '42'; } }, {}, () => {
    credentialReads++;
    return 'test-key';
  });
  const doc = document();
  doc.languageId = 'markdown';
  assert.deepEqual(await provider.provideInlineCompletionItems(doc, position, invoke, token()), []);
  assert.equal(credentialReads, 0);
  settings.languages = ['*'];
  assert.equal((await provider.provideInlineCompletionItems(doc, position, invoke, token()))[0].insertText, '42');
  settings.languages = [];
  assert.deepEqual(await provider.provideInlineCompletionItems(doc, position, invoke, token()), []);
  settings.languages = ['markdown'];
  assert.equal((await provider.provideInlineCompletionItems(doc, position, invoke, token()))[0].insertText, '42');
  assert.equal(calls, 2);
  provider.dispose();
});

test('errors starting with DeepSeek cannot smuggle private data into the output channel', async () => {
  const { provider, logs } = setup({ async complete() { throw new Error('DeepSeek test-key private source'); } });
  assert.deepEqual(await provider.provideInlineCompletionItems(document(), position, invoke, token()), []);
  assert.equal(logs.length, 1);
  assert.ok(!logs[0].includes('test-key'));
  assert.ok(!logs[0].includes('private source'));
  provider.dispose();
});

test('VS Code cancellation reaches the actual HTTP connection through provider and client', { timeout: 10000 }, async () => {
  const arrived = deferred();
  const disconnected = deferred();
  const server = await openServer((request, response) => {
    request.resume();
    response.on('close', disconnected.resolve);
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.write('{"choices":[{"text":"');
    arrived.resolve();
  });
  const client = new DeepSeekClient((_url, init) => fetch(server.url, init));
  const { provider, logs } = setup(client);
  try {
    const cancellation = token();
    const pending = provider.provideInlineCompletionItems(document(), position, invoke, cancellation);
    await arrived.promise;
    cancellation.cancel();
    assert.deepEqual(await pending, []);
    await disconnected.promise;
    assert.equal(cancellation.listeners.size, 0);
    assert.deepEqual(logs, []);
  } finally {
    provider.dispose();
    await server.close();
  }
});

test('live provider switching routes to matching client, key, model and URL', async () => {
  const { CompletionClient } = require('../out/completionClient');
  const { OpenAIClient } = require('../out/openaiClient');
  const calls = [];
  const fetcher = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body, key: init.headers.Authorization });
    return url.includes('/chat/completions')
      ? Response.json({ choices: [{ message: { content: '43;' } }] })
      : Response.json({ choices: [{ text: '42;' }] });
  };
  const client = new CompletionClient(new DeepSeekClient(fetcher), new OpenAIClient(fetcher));
  const { provider, settings } = setup(client, {}, selected => `${selected}-key`);
  try {
    assert.equal((await provider.provideInlineCompletionItems(document(), position, invoke, token()))[0].insertText, '42');
    settings.provider = 'openai';
    settings.model = 'gpt-6.1-sol';
    settings.baseUrl = 'https://proxy.example/v1';
    assert.equal((await provider.provideInlineCompletionItems(document(), position, invoke, token()))[0].insertText, '43');
    assert.equal(calls[0].url, 'https://api.deepseek.com/beta/completions');
    assert.equal(calls[0].key, 'Bearer deepseek-key');
    assert.equal(calls[0].body.model, 'deepseek-flash');
    assert.equal(calls[1].url, 'https://proxy.example/v1/chat/completions');
    assert.equal(calls[1].key, 'Bearer openai-key');
    assert.equal(calls[1].body.model, 'gpt-6.1-sol');
    settings.provider = 'deepseek';
    settings.model = 'deepseek-flash';
    settings.baseUrl = 'https://api.deepseek.com/beta';
    assert.equal((await provider.provideInlineCompletionItems(document(), position, invoke, token()))[0].insertText, '42');
  } finally {
    provider.dispose();
  }
});

test('provider changes during credential reads or network waits suppress old suggestions', async () => {
  const credentials = deferred();
  let calls = 0;
  const waiting = setup({ async complete() { calls++; return '42'; } }, {}, () => credentials.promise);
  const pendingCredential = waiting.provider.provideInlineCompletionItems(document(), position, invoke, token());
  waiting.settings.provider = 'openai';
  credentials.resolve('deepseek-key');
  assert.deepEqual(await pendingCredential, []);
  assert.equal(calls, 0);
  waiting.provider.dispose();
  const client = controlledClient();
  const active = setup(client);
  const pendingNetwork = active.provider.provideInlineCompletionItems(document(), position, invoke, token());
  active.settings.provider = 'openai';
  client.calls[0].resolve('old-deepseek');
  assert.deepEqual(await pendingNetwork, []);
  active.provider.dispose();
});

test('configuration changes cancel pending requests without disposing the provider', async () => {
  const client = controlledClient();
  const { provider } = setup(client);
  const pending = provider.provideInlineCompletionItems(document(), position, invoke, token());
  provider.cancelPendingRequests();
  assert.equal(client.calls[0].signal.aborted, true);
  client.calls[0].resolve('old');
  assert.deepEqual(await pending, []);
  const next = provider.provideInlineCompletionItems(document(), position, invoke, token());
  client.calls[1].resolve('new');
  assert.equal((await next)[0].insertText, 'new');
  provider.dispose();
});

test('missing OpenAI key never falls back to DeepSeek credentials', async () => {
  let calls = 0;
  const { provider, settings } = setup({ async complete() { calls++; return '42'; } }, {}, selected => selected === 'deepseek' ? 'deepseek-key' : undefined);
  const before = warnings.length;
  settings.provider = 'openai';
  assert.deepEqual(await provider.provideInlineCompletionItems(document(), position, invoke, token()), []);
  assert.ok(warnings[before].includes('OPENAI_API_KEY'));
  assert.equal(calls, 0);
  provider.dispose();
});

test('reasoning effort reaches OpenAI only, updates immediately and suppresses stale results', async () => {
  const { CompletionClient } = require('../out/completionClient');
  const { OpenAIClient } = require('../out/openaiClient');
  const payloads = [];
  const fetcher = async (_url, init) => {
    const payload = JSON.parse(init.body);
    payloads.push(payload);
    return payload.messages ? Response.json({ choices: [{ message: { content: '42;' } }] })
      : Response.json({ choices: [{ text: '42;' }] });
  };
  const client = new CompletionClient(new DeepSeekClient(fetcher), new OpenAIClient(fetcher));
  const { provider, settings } = setup(client, {
    provider: 'openai', model: 'gpt-6.1-sol', baseUrl: 'https://api.openai.com/v1', reasoningEffort: 'low',
  });
  try {
    await provider.provideInlineCompletionItems(document(), position, invoke, token());
    assert.equal(payloads[0].reasoning_effort, 'low');
    settings.reasoningEffort = 'high';
    await provider.provideInlineCompletionItems(document(), position, invoke, token());
    assert.equal(payloads[1].reasoning_effort, 'high');
    settings.provider = 'deepseek';
    settings.baseUrl = 'https://api.deepseek.com/beta';
    settings.model = 'deepseek-flash';
    await provider.provideInlineCompletionItems(document(), position, invoke, token());
    assert.equal(Object.hasOwn(payloads[2], 'reasoning_effort'), false);
  } finally {
    provider.dispose();
  }
  const controlled = controlledClient();
  const active = setup(controlled, { reasoningEffort: 'low' });
  const pending = active.provider.provideInlineCompletionItems(document(), position, invoke, token());
  active.settings.reasoningEffort = 'high';
  controlled.calls[0].resolve('outdated');
  assert.deepEqual(await pending, []);
  active.provider.dispose();
});
