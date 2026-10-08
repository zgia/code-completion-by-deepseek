'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DeepSeekClient, DEEPSEEK_ENDPOINT } = require('../out/deepseekClient');
const options = { apiKey: 'test-key', model: 'deepseek-flash', maxTokens: 128 };
const context = { prefix: 'const answer = ', suffix: ';' };
const { deferred, openServer } = require('./helpers/httpServer');

test('sends DeepSeek FIM prompt/suffix and reads choices[].text', async () => {
  let captured;
  const signal = new AbortController().signal;
  const client = new DeepSeekClient(async (url, init) => {
    captured = { url, init };
    return Response.json({ choices: [{ text: '42' }] });
  });
  assert.equal(await client.complete(context, options, signal), '42');
  assert.equal(captured.url, DEEPSEEK_ENDPOINT);
  assert.equal(captured.init.headers.Authorization, 'Bearer test-key');
  assert.equal(captured.init.signal, signal);
  assert.equal(captured.init.redirect, 'error');
  assert.deepEqual(JSON.parse(captured.init.body), {
    model: 'deepseek-flash', prompt: context.prefix, suffix: ';',
    max_tokens: 128, temperature: 0, stream: false,
  });
});

test('handles split UTF-8 JSON responses', async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ choices: [{ text: '你好' }] }));
  const client = new DeepSeekClient(async () => new Response(new ReadableStream({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  })));
  assert.equal(await client.complete(context, options, new AbortController().signal), '你好');
});

test('HTTP errors never expose the response body or credentials', async () => {
  for (const status of [401, 402, 429, 500]) {
    const client = new DeepSeekClient(async () => new Response('test-key private source', { status }));
    await assert.rejects(client.complete(context, options, new AbortController().signal), error => {
      assert.ok(error.message.includes(`HTTP ${status}`));
      assert.ok(!error.message.includes('test-key'));
      assert.ok(!error.message.includes('private source'));
      return true;
    });
  }
});

test('rejects malformed payloads and bounds the response stream', async () => {
  for (const body of [{ choices: [] }, { choices: [{ message: { content: 'chat response' } }] }, null]) {
    const client = new DeepSeekClient(async () => Response.json(body));
    await assert.rejects(client.complete(context, options, new AbortController().signal), /格式/);
  }
  let cancelled = false;
  const client = new DeepSeekClient(async () => new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(65537)); },
    cancel() { cancelled = true; },
  })));
  await assert.rejects(client.complete(context, options, new AbortController().signal), /大小限制/);
  assert.equal(cancelled, true);
});

test('already-cancelled requests never reach the network', async () => {
  let calls = 0;
  const client = new DeepSeekClient(async () => { calls++; return Response.json({}); });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(client.complete(context, options, controller.signal), { name: 'AbortError' });
  assert.equal(calls, 0);
});

test('cancellation aborts real fetch before headers and while reading the response body', { timeout: 10000 }, async () => {
  for (const sendHeaders of [false, true]) {
    const arrived = deferred();
    const readingBody = deferred();
    const disconnected = deferred();
    const server = await openServer((request, response) => {
      request.resume();
      response.on('close', disconnected.resolve);
      if (sendHeaders) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.write('{"choices":[{"text":"');
      }
      arrived.resolve();
    });
    try {
      const controller = new AbortController();
      const client = new DeepSeekClient(async (_url, init) => {
        const response = await fetch(server.url, init);
        if (sendHeaders) {
          const getReader = response.body.getReader.bind(response.body);
          response.body.getReader = () => {
            const reader = getReader();
            const read = reader.read.bind(reader);
            reader.read = () => {
              readingBody.resolve();
              return read();
            };
            return reader;
          };
        }
        return response;
      });
      const pending = client.complete(context, options, controller.signal);
      const rejected = assert.rejects(pending, { name: 'AbortError' });
      await arrived.promise;
      if (sendHeaders) await readingBody.promise;
      controller.abort();
      await rejected;
      await disconnected.promise;
    } finally {
      await server.close();
    }
  }
});

test('malformed JSON produces a safe error without exposing body contents', async () => {
  const client = new DeepSeekClient(async () => new Response('test-key private source'));
  await assert.rejects(client.complete(context, options, new AbortController().signal), error => {
    assert.equal(error.message, 'DeepSeek 返回了无效的 JSON。');
    return true;
  });
});
