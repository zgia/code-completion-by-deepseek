// Only errors constructed by our clients are safe to show in the output channel.
export class CompletionError extends Error {}

const MAX_RESPONSE_BYTES = 64 * 1024;

export function endpoint(baseUrl: string, path: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new CompletionError('接口基础地址无效，请检查 baseUrl 配置。');
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new CompletionError('接口基础地址须为 HTTP(S) 地址，且不能包含账号、密码、查询参数或片段。');
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/${path}`;
  return url.toString();
}

export async function requestJson(
  fetcher: typeof fetch,
  url: string,
  apiKey: string,
  payload: unknown,
  signal: AbortSignal,
  label: string,
): Promise<unknown> {
  signal.throwIfAborted();
  const response = await fetcher(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
    signal,
    redirect: 'error',
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new CompletionError(`${label} 请求失败（HTTP ${response.status}）。`);
  }
  if (!response.body) {
    throw new CompletionError(`${label} 返回了空响应。`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      signal.throwIfAborted();
      if (chunk.done) {
        text += decoder.decode();
        break;
      }
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        throw new CompletionError(`${label} 响应超过大小限制。`);
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new CompletionError(`${label} 返回了无效的 JSON。`);
  }
}
