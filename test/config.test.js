'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const manifest = require('../package.json');
const properties = manifest.contributes.configuration.properties;
let configured = {};
let scope;
const vscode = {
  workspace: {
    getConfiguration(section, uri) {
      assert.equal(section, 'zgia.CodeCompletion');
      scope = uri;
      return {
        get: (key, fallback) => configured[key] ?? properties[`zgia.CodeCompletion.${key}`]?.default ?? fallback,
        inspect: key => ({ globalValue: configured[key] }),
      };
    },
  },
};
const originalLoad = Module._load;
Module._load = function (id, ...rest) { return id === 'vscode' ? vscode : originalLoad.call(this, id, ...rest); };
const { readSettings } = require('../out/config');
Module._load = originalLoad;
const document = { uri: { path: '/test.ts' } };

test('runtime defaults match contributed settings and API key is absent from settings', () => {
  configured = {};
  const settings = readSettings(document, {});
  for (const [key, value] of Object.entries(settings)) {
    const configKey = key === 'reasoningEffort' ? 'openai.reasoningEffort'
      : ['model', 'baseUrl'].includes(key) ? `deepseek.${key}` : key;
    assert.deepEqual(value, properties[`zgia.CodeCompletion.${configKey}`].default);
  }
  assert.equal(scope, document.uri);
  assert.equal(properties['zgia.CodeCompletion.apiKey'], undefined);
  assert.deepEqual(Object.keys(manifest.contributes), ['commands', 'configuration']);
  assert.ok(!manifest.enabledApiProposals);
});

test('model trims whitespace and legacy API key settings are ignored', () => {
  configured = { model: ' custom-model ', apiKey: ' configured-key ' };
  assert.equal(readSettings(document, {}).model, 'custom-model');
  assert.equal(readSettings(document, {}).apiKey, undefined);
  configured = { model: ' ', apiKey: false };
  assert.equal(readSettings(document, {}).model, 'deepseek-flash');
  assert.equal(readSettings(document, {}).apiKey, undefined);
});

test('numeric settings clamp to manifest bounds and reject non-finite values', () => {
  configured = { debounceMs: -1, timeoutMs: Infinity, maxTokens: 5000, maxLines: 2.9 };
  const settings = readSettings(document, {});
  assert.equal(settings.debounceMs, 0);
  assert.equal(settings.timeoutMs, 10000);
  assert.equal(settings.maxTokens, 1024);
  assert.equal(settings.maxLines, 2);
});

test('language IDs normalize, empty lists disable and invalid settings use defaults', () => {
  configured = { languages: [' php ', '', 42, '*'] };
  assert.deepEqual(readSettings(document, {}).languages, ['php', '*']);
  configured = { languages: [] };
  assert.deepEqual(readSettings(document, {}).languages, []);
  configured = { languages: false };
  assert.deepEqual(readSettings(document, {}).languages, properties['zgia.CodeCompletion.languages'].default);
});

test('provider model and base URL use explicit settings, then its environment, then defaults', () => {
  const environment = {
    OPENAI_MODEL: ' env-openai ', OPENAI_BASE_URL: ' https://openai-proxy.example/v1 ',
    DEEPSEEK_MODEL: 'env-deepseek', DEEPSEEK_BASE_URL: 'https://deepseek-proxy.example/beta',
  };
  configured = { provider: 'openai', model: 'legacy-deepseek' };
  let settings = readSettings(document, environment);
  assert.equal(settings.model, 'env-openai');
  assert.equal(settings.baseUrl, 'https://openai-proxy.example/v1');
  configured['openai.model'] = ' explicit-openai ';
  configured['openai.baseUrl'] = ' https://explicit.example/v1 ';
  settings = readSettings(document, environment);
  assert.equal(settings.model, 'explicit-openai');
  assert.equal(settings.baseUrl, 'https://explicit.example/v1');
  configured['openai.model'] = ' ';
  configured['openai.baseUrl'] = false;
  assert.equal(readSettings(document, environment).model, 'env-openai');
  assert.equal(readSettings(document, environment).baseUrl, 'https://openai-proxy.example/v1');
  configured = { provider: 'deepseek', model: 'legacy-deepseek' };
  assert.equal(readSettings(document, environment).model, 'legacy-deepseek');
  configured['deepseek.model'] = 'specific-deepseek';
  assert.equal(readSettings(document, environment).model, 'specific-deepseek');
  configured = { provider: 'deepseek' };
  assert.equal(readSettings(document, environment).model, 'env-deepseek');
  assert.equal(readSettings(document, environment).baseUrl, 'https://deepseek-proxy.example/beta');
  configured = { provider: 'openai' };
  assert.equal(readSettings(document, {}).model, 'gpt-6.1-sol');
  assert.equal(readSettings(document, {}).baseUrl, 'https://api.openai.com/v1');
  configured = { provider: 'invalid' };
  assert.equal(readSettings(document, {}).provider, 'deepseek');
});

test('OpenAI reasoning effort resolves explicit settings, environment and model default independently', () => {
  configured = { provider: 'openai' };
  assert.equal(readSettings(document, {}).reasoningEffort, 'default');
  assert.equal(readSettings(document, { OPENAI_REASONING_EFFORT: ' low ' }).reasoningEffort, 'low');
  for (const effort of properties['zgia.CodeCompletion.openai.reasoningEffort'].enum) {
    configured['openai.reasoningEffort'] = effort;
    assert.equal(readSettings(document, { OPENAI_REASONING_EFFORT: 'high' }).reasoningEffort, effort);
  }
  configured['openai.reasoningEffort'] = ' ';
  assert.equal(readSettings(document, { OPENAI_REASONING_EFFORT: 'low' }).reasoningEffort, 'low');
  configured['openai.reasoningEffort'] = 'invalid';
  assert.equal(readSettings(document, { OPENAI_REASONING_EFFORT: 'high' }).reasoningEffort, 'default');
  configured = { provider: 'openai' };
  assert.equal(readSettings(document, { OPENAI_REASONING_EFFORT: 'invalid' }).reasoningEffort, 'default');
  configured = { provider: 'deepseek', 'openai.reasoningEffort': 'high' };
  assert.equal(readSettings(document, { OPENAI_REASONING_EFFORT: 'low' }).reasoningEffort, 'default');
});
