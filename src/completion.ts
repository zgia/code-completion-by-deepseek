export interface CodeContext {
  prefix: string;
  suffix: string;
}

// Keep context near the cursor and bound the total source sent to the provider.
export function trimContext(prefix: string, suffix: string): CodeContext {
  return {
    prefix: prefix.split(/\r?\n/).slice(-81).join('\n').slice(-12000),
    suffix: suffix.split(/\r?\n/).slice(0, 21).join('\n').slice(0, 4000),
  };
}

export function normalizeCompletion(raw: string, context: CodeContext, maxLines: number): string {
  let text = raw.replace(/\r\n/g, '\n');
  const fenced = text.trim().match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
  if (fenced) {
    text = fenced[1];
  }
  // FIM already returns insertion text. Do not strip matching prefixes: a match
  // may be intentional, e.g. completing "a" with "a" to produce "aa".
  text = text.split('\n').slice(0, maxLines).join('\n');
  // Only deduplicate closing punctuation already on the cursor line. Matching
  // identifiers or newlines can be intentional ("a" + "a", adjacent blocks).
  const closingSuffix = context.suffix.match(/^[)\]};,]+/)?.[0] ?? '';
  for (let size = Math.min(text.length, closingSuffix.length); size > 0; size--) {
    if (text.endsWith(closingSuffix.slice(0, size))) {
      text = text.slice(0, -size);
      break;
    }
  }
  return text.trim() ? text : '';
}

export function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
