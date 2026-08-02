/**
 * agent 网络工具共享助手（ADR-018）
 * fetch 文本抓取 + HTML→文本剥离 + SSRF-lite host 拦截
 */

/** 抓取选项 */
export interface FetchTextOptions {
  /** 外部中止信号 */
  signal?: AbortSignal;
  /** 超时毫秒（默认 30s） */
  timeoutMs?: number;
  /** 响应大小上限（默认 128KB） */
  maxBytes?: number;
}

/**
 * 判断 hostname 是否被 SSRF-lite 防线拦截（localhost / 私有 IP 字面量）
 * 已知局限：不做 DNS 解析，hostname 指向内网 IP 的情况无法拦截
 * @param hostname - URL hostname
 * @returns 是否应拦截
 */
export function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h === '::1' || h === '::' || h === '0.0.0.0') return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^(fe80|fc00|fd00|fec0):/.test(h)) return true;
  return false;
}

/**
 * 抓取 GET 响应文本（带超时与大小上限）
 * @param url - 完整 URL
 * @param options - 抓取选项
 * @returns 响应文本
 */
export async function fetchResponseText(
  url: string,
  options: FetchTextOptions = {}
): Promise<string> {
  const { signal, timeoutMs = 30_000, maxBytes = 128 * 1024 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onExternalAbort, { once: true });
  }
  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (Buffer.byteLength(text, 'utf-8') > maxBytes) {
      throw new Error(`response too large (max ${maxBytes} bytes)`);
    }
    return text;
  } catch (error) {
    const message = controller.signal.aborted
      ? 'request timed out'
      : (error instanceof Error ? error.message : String(error));
    throw new Error(message, { cause: error });
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * 把 HTML 剥离为可读文本（去 script/style/标签、解基本实体、压缩空白）
 * @param html - 原始 HTML
 * @returns 可读文本
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#\d+;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}
