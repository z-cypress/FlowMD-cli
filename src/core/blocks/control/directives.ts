/**
 * v1.3 控制流指令解析
 * 从 Markdown HTML 注释节点中识别控制指令：
 *   <!-- if: {{score}} > 80 --> / <!-- elif: ... --> / <!-- else --> / <!-- endif -->
 *   <!-- for: item in orders --> / <!-- for: item in orders {collect: "results"} --> / <!-- endfor -->
 * 非指令注释（如普通 HTML 注释）返回 null。
 */

import type { ControlDirective, ControlDirectiveKind } from '../../../types/index.js';

/** 指令关键字 → 类型 */
const KIND_MAP: Record<string, ControlDirectiveKind> = {
  if: 'if',
  elif: 'elif',
  else: 'else',
  endif: 'endif',
  for: 'for',
  endfor: 'endfor',
};

/** 指令关键字集合 */
const DIRECTIVE_KEYS = Object.keys(KIND_MAP);

/** HTML 注释正则：`<!-- ... -->` */
const HTML_COMMENT_REGEX = /^\s*<!--\s*([\s\S]*?)\s*-->\s*$/;

/**
 * 从 HTML 注释 value 中解析控制指令
 * @param raw - 完整的 HTML 注释文本（如 `<!-- if: {{score}} > 80 -->`）
 * @param sourceStart - 注释起始偏移
 * @returns 解析后的指令，非控制指令返回 null
 */
export function parseDirective(raw: string, sourceStart: number): ControlDirective | null {
  const match = HTML_COMMENT_REGEX.exec(raw);
  if (!match) return null;

  const inner = match[1].trim();
  if (!inner) return null;

  // 找到关键字（首词）
  const keyMatch = /^([a-z]+)\b/.exec(inner);
  if (!keyMatch) return null;

  const key = keyMatch[1].toLowerCase();
  if (!DIRECTIVE_KEYS.includes(key)) return null;

  const kind = KIND_MAP[key];
  const rest = inner.slice(keyMatch[0].length).trim();

  const directive: ControlDirective = {
    kind,
    raw,
    sourceStart,
    sourceEnd: sourceStart + raw.length,
  };

  switch (kind) {
    case 'if':
    case 'elif': {
      // 支持 `if:` 或 `if ` 分隔
      const cond = rest.replace(/^:/, '').trim();
      if (!cond) return null;
      directive.condition = cond;
      return directive;
    }
    case 'for': {
      const body = rest.replace(/^:/, '').trim();
      if (!body) return null;
      parseForBody(body, directive);
      if (!directive.loopVar || !directive.listExpr) return null;
      return directive;
    }
    default:
      // else/endif/endfor 无参数
      return directive;
  }
}

/**
 * 解析 for 指令体：`item in orders {collect: "results"}`
 * @param body - for 指令的参数字符串
 * @param directive - 目标指令对象（就地填充）
 */
function parseForBody(body: string, directive: ControlDirective): void {
  // 分离 collect 元数据：`item in orders {collect: "results"}`
  let loopSpec = body;
  const braceIdx = body.indexOf('{');
  if (braceIdx !== -1) {
    loopSpec = body.slice(0, braceIdx).trim();
    const metaStr = body.slice(braceIdx + 1, body.lastIndexOf('}'));
    const collectMatch = /\bcollect\s*:\s*["']?([\w.-]+)["']?/.exec(metaStr);
    if (collectMatch) {
      directive.collect = collectMatch[1];
    }
  }

  // 解析 `item in orders`：以独立的 ` in ` 分隔
  const inMatch = /\b in \b/.exec(loopSpec);
  if (!inMatch) return;
  directive.loopVar = loopSpec.slice(0, inMatch.index).trim();
  directive.listExpr = loopSpec.slice(inMatch.index + inMatch[0].length).trim();
}
