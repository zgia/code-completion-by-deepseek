'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { OpenAIClient, OPENAI_ENDPOINT } = require('../out/openaiClient');
const { CompletionError } = require('../out/httpClient');
const { deferred, openServer } = require('./helpers/httpServer');
const options = { apiKey: 'openai-test-key', model: 'gpt-6.1-sol', maxTokens: 128 };
const context = { prefix: 'const answer = ', suffix: ';' };

test('OpenAI uses chat messages with both cursor contexts and reads message.content', async () => {
  let captured;
  const signal = new AbortController().signal;
  const client = new OpenAIClient(async (url, init) => {
    captured = { url, init };
    return Response.json({ choices: [{ message: { content: '42' } }] });
  });
  assert.equal(await client.complete(context, options, signal), '42');
  assert.equal(captured.url, OPENAI_ENDPOINT);
  assert.equal(captured.init.headers.Authorization, 'Bearer openai-test-key');
  assert.equal(captured.init.signal, signal);
  assert.equal(captured.init.redirect, 'error');
  const payload = JSON.parse(captured.init.body);
  assert.equal(payload.model, options.model);
  assert.equal(payload.max_completion_tokens, 128);
  assert.equal(payload.stream, false);
  assert.equal(payload.max_tokens, undefined);
  assert.equal(payload.temperature, undefined);
  assert.equal(payload.messages[0].role, 'system');
  assert.ok(payload.messages[0].content.includes('only the code'));
  assert.deepEqual(JSON.parse(payload.messages[1].content), context);
});

test('OpenAI respects custom base URL and rejects invalid addresses without exposing them', async () => {
  let calls = 0;
  const client = new OpenAIClient(async (url) => {
    calls++;
    assert.equal(url, 'https://proxy.example/custom/v1/chat/completions');
    return Response.json({ choices: [{ message: { content: '' } }] });
  });
  assert.equal(await client.complete(context, { ...options, baseUrl: 'https://proxy.example/custom/v1///' }, new AbortController().signal), '');
  for (const baseUrl of ['not-a-url-private-key', 'file:///private-key', 'https://private-key@proxy.example', 'https://proxy.example?private-key', 'https://proxy.example#private-key']) {
    await assert.rejects(client.complete(context, { ...options, baseUrl }, new AbortController().signal), error => {
      assert.ok(error instanceof CompletionError);
      assert.ok(!error.message.includes('private-key'));
      return true;
    });
  }
  assert.equal(calls, 1);
});

test('OpenAI validates content and reports only safe errors for HTTP and malformed responses', async () => {
  for (const body of [null, {}, { choices: [] }, { choices: [{ text: 'FIM' }] }, { choices: [{ message: { content: null } }] }]) {
    const client = new OpenAIClient(async () => Response.json(body));
    await assert.rejects(client.complete(context, options, new AbortController().signal), /格式/);
  }
  for (const status of [401, 429, 500]) {
    const client = new OpenAIClient(async () => new Response('openai-test-key private source', { status }));
    await assert.rejects(client.complete(context, options, new AbortController().signal), error => {
      assert.equal(error.message, `OpenAI 请求失败（HTTP ${status}）。`);
      return true;
    });
  }
  const invalid = new OpenAIClient(async () => new Response('openai-test-key private source'));
  await assert.rejects(invalid.complete(context, options, new AbortController().signal), { message: 'OpenAI 返回了无效的 JSON。' });
});

test('OpenAI cancellation disconnects real HTTP while reading the response', { timeout: 10000 }, async () => {
  const arrived = deferred();
  const disconnected = deferred();
  const server = await openServer((request, response) => {
    request.resume();
    response.on('close', disconnected.resolve);
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.write('{"choices":[{"message":{"content":"');
    arrived.resolve();
  });
  try {
    const controller = new AbortController();
    const client = new OpenAIClient();
    const rejected = assert.rejects(client.complete(context, { ...options, baseUrl: server.url }, controller.signal), { name: 'AbortError' });
    await arrived.promise;
    controller.abort();
    await rejected;
    await disconnected.promise;
  } finally {
    await server.close();
  }
});

test('OpenAI sends the selected reasoning effort; default and unset omit the parameter', async () => {
  const captured = [];
  const client = new OpenAIClient(async (_url, init) => {
    captured.push(JSON.parse(init.body));
    return Response.json({ choices: [{ message: { content: '42' } }] });
  });
  for (const reasoningEffort of [undefined, 'default', 'low', 'medium', 'high', 'xhigh', 'max']) {
    await client.complete(context, { ...options, model: 'gpt-6.1-sol', reasoningEffort }, new AbortController().signal);
    const body = captured.at(-1);
    if (!reasoningEffort || reasoningEffort === 'default') {
      assert.equal(Object.hasOwn(body, 'reasoning_effort'), false);
    } else {
      assert.equal(body.reasoning_effort, reasoningEffort);
    }
    assert.equal(body.model, 'gpt-6.1-sol');
  }
});
