/**
 * v1.3 条件表达式：轻量安全的递归下降求值器
 * 支持：数字/字符串字面量、{{变量}} 引用（含深层路径与数组下标）、
 * 比较（== != > < >= <=）、逻辑（&& || !）、括号分组。
 * 无 eval/Function，拒绝函数调用等任意 JS 语法。
 */

/** 语法错误，携带位置信息 */
export class ConditionSyntaxError extends Error {
  /** 错误位置（字符偏移） */
  readonly pos: number;

  constructor(message: string, pos: number) {
    super(message);
    this.name = 'ConditionSyntaxError';
    this.pos = pos;
  }
}

/** 变量解析函数：输入路径（如 a.b.0），返回上下文中的值 */
export type ConditionResolver = (path: string) => unknown;

/** 变量引用正则：{{name}} 或 {{a.b.c}} 或 {{items.0}} */
const VAR_REF_REGEX = /\{\{([\w.-]+)\}\}/;

/** 括号最大嵌套深度（防递归栈溢出 DoS） */
const MAX_PARSE_DEPTH = 64;

// ---- Tokenizer ----

type TokenType = 'number' | 'string' | 'var' | 'ident' | 'op' | 'lparen' | 'rparen' | 'eof';

interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

const OPERATORS = ['==', '!=', '>=', '<=', '&&', '||', '>', '<', '!'];

/**
 * 将表达式字符串切分为 token 流
 * @param input - 条件表达式
 * @returns token 数组
 */
function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    // 空白
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // 变量引用 {{...}}
    if (ch === '{' && input[i + 1] === '{') {
      const match = VAR_REF_REGEX.exec(input.slice(i));
      if (!match) {
        throw new ConditionSyntaxError('无效的变量引用，期望 {{name}}', i);
      }
      tokens.push({ type: 'var', value: match[1], pos: i });
      i += match[0].length;
      continue;
    }

    // 数字
    if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(input[i + 1] ?? ''))) {
      let j = i + 1;
      while (j < input.length && /[0-9.]/.test(input[j])) j++;
      const numStr = input.slice(i, j);
      tokens.push({ type: 'number', value: numStr, pos: i });
      i = j;
      continue;
    }

    // 字符串（单引号/双引号）
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      let escaped = false;
      while (j < input.length) {
        const c = input[j];
        if (escaped) {
          escaped = false;
        } else if (c === '\\') {
          escaped = true;
        } else if (c === quote) {
          break;
        }
        j++;
      }
      if (j >= input.length) {
        throw new ConditionSyntaxError('字符串缺少结束引号', i);
      }
      const raw = input.slice(i + 1, j);
      const value = raw.replace(/\\(.)/g, '$1');
      tokens.push({ type: 'string', value, pos: i });
      i = j + 1;
      continue;
    }

    // 运算符（最长优先）
    const op = OPERATORS.find((o) => input.startsWith(o, i));
    if (op) {
      tokens.push({ type: 'op', value: op, pos: i });
      i += op.length;
      continue;
    }

    // 括号
    if (ch === '(') {
      tokens.push({ type: 'lparen', value: '(', pos: i });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ')', pos: i });
      i++;
      continue;
    }

    // 标识符（true/false/null）
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i + 1;
      while (j < input.length && /[a-zA-Z0-9_]/.test(input[j])) j++;
      const word = input.slice(i, j);
      tokens.push({ type: 'ident', value: word, pos: i });
      i = j;
      continue;
    }

    throw new ConditionSyntaxError(`无法识别的字符 '${ch}'`, i);
  }

  tokens.push({ type: 'eof', value: '', pos: input.length });
  return tokens;
}

// ---- AST ----

type Node = VarNode | LiteralNode | CompareNode | LogicNode | NotNode;

interface VarNode {
  kind: 'var';
  path: string;
  pos: number;
}

interface LiteralNode {
  kind: 'literal';
  value: unknown;
  pos: number;
}

interface CompareNode {
  kind: 'compare';
  op: string;
  left: Node;
  right: Node;
  pos: number;
}

interface LogicNode {
  kind: 'logic';
  op: string;
  left: Node;
  right: Node;
  pos: number;
}

interface NotNode {
  kind: 'not';
  operand: Node;
  pos: number;
}

// ---- Parser ----

/**
 * 递归下降解析器
 * 优先级：! > 比较 > && > ||
 */
class Parser {
  private tokens: Token[];
  private index = 0;
  /** 括号嵌套深度（防止恶意深层括号导致栈溢出 DoS） */
  private depth = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.index];
  }

  private next(): Token {
    return this.tokens[this.index++];
  }

  private expect(type: TokenType, what: string): Token {
    const tok = this.peek();
    if (tok.type !== type) {
      throw new ConditionSyntaxError(`期望${what}，实际为 '${tok.value}'`, tok.pos);
    }
    return this.next();
  }

  /** 表达式入口：orExpr */
  parse(): Node {
    return this.parseOr();
  }

  private parseOr(): Node {
    let left = this.parseAnd();
    while (this.peek().type === 'op' && this.peek().value === '||') {
      const opTok = this.next();
      const right = this.parseAnd();
      left = { kind: 'logic', op: '||', left, right, pos: opTok.pos };
    }
    return left;
  }

  private parseAnd(): Node {
    let left = this.parseComparison();
    while (this.peek().type === 'op' && this.peek().value === '&&') {
      const opTok = this.next();
      const right = this.parseComparison();
      left = { kind: 'logic', op: '&&', left, right, pos: opTok.pos };
    }
    return left;
  }

  private parseComparison(): Node {
    const left = this.parseUnary();
    const tok = this.peek();
    if (tok.type === 'op' && ['==', '!=', '>', '<', '>=', '<='].includes(tok.value)) {
      const opTok = this.next();
      const right = this.parseUnary();
      return { kind: 'compare', op: opTok.value, left, right, pos: opTok.pos };
    }
    return left;
  }

  private parseUnary(): Node {
    const tok = this.peek();
    if (tok.type === 'op' && tok.value === '!') {
      const opTok = this.next();
      const operand = this.parseUnary();
      return { kind: 'not', operand, pos: opTok.pos };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Node {
    const tok = this.peek();

    switch (tok.type) {
      case 'number':
        this.next();
        return { kind: 'literal', value: Number(tok.value), pos: tok.pos };
      case 'string':
        this.next();
        return { kind: 'literal', value: tok.value, pos: tok.pos };
      case 'var':
        this.next();
        return { kind: 'var', path: tok.value, pos: tok.pos };
      case 'ident': {
        this.next();
        if (tok.value === 'true') return { kind: 'literal', value: true, pos: tok.pos };
        if (tok.value === 'false') return { kind: 'literal', value: false, pos: tok.pos };
        if (tok.value === 'null') return { kind: 'literal', value: null, pos: tok.pos };
        throw new ConditionSyntaxError(`未知标识符 '${tok.value}'（仅支持 true/false/null 字面量）`, tok.pos);
      }
      case 'lparen': {
        this.next();
        // 深度限制：防止深层嵌套括号导致递归栈溢出（DoS）
        this.depth++;
        if (this.depth > MAX_PARSE_DEPTH) {
          throw new ConditionSyntaxError(`条件表达式嵌套过深（上限 ${MAX_PARSE_DEPTH} 层括号）`, tok.pos);
        }
        const expr = this.parseOr();
        this.depth--;
        this.expect('rparen', ')');
        return expr;
      }
      default:
        throw new ConditionSyntaxError(`非预期 token '${tok.value}'`, tok.pos);
    }
  }
}

// ---- Evaluator ----

/**
 * 判断值是否为真值
 * false / null / undefined / 0 / '' 为 falsy，其余为 truthy
 * @param value - 要判断的值
 * @returns 是否为真值
 */
function isTruthy(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (value === false) return false;
  if (value === 0) return false;
  if (value === '') return false;
  return true;
}

/**
 * 比较两个值（宽松相等）
 * 数字按数值比较，字符串按字符串比较，其余用严格相等
 * @param a - 左值
 * @param b - 右值
 * @returns 是否相等
 */
function looseEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // 数字与数字字符串按数值比较
  if (typeof a === 'number' && typeof b === 'string' && b.trim() !== '' && !Number.isNaN(Number(b))) {
    return a === Number(b);
  }
  if (typeof b === 'number' && typeof a === 'string' && a.trim() !== '' && !Number.isNaN(Number(a))) {
    return Number(a) === b;
  }
  // 'true'/'false' 字符串与布尔比较
  if (typeof a === 'boolean' && typeof b === 'string') {
    return a === (b === 'true');
  }
  if (typeof b === 'boolean' && typeof a === 'string') {
    return b === (a === 'true');
  }
  return a === b;
}

/**
 * 执行大小比较（> < >= <=）
 * 数字按数值，字符串按字典序；无法比较时返回 false
 * @param a - 左值
 * @param b - 右值
 * @param op - 比较运算符
 * @returns 比较结果
 */
function orderCompare(a: unknown, b: unknown, op: string): boolean {
  // 数值比较（含数字字符串与数字混比）
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na !== null && nb !== null) {
    return compareNumbers(na, nb, op);
  }
  // 字符串字典序
  if (typeof a === 'string' && typeof b === 'string') {
    switch (op) {
      case '>': return a > b;
      case '<': return a < b;
      case '>=': return a >= b;
      case '<=': return a <= b;
    }
  }
  return false;
}

/** 尝试把值转为数字；无法转换返回 null */
function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

function compareNumbers(a: number, b: number, op: string): boolean {
  switch (op) {
    case '>': return a > b;
    case '<': return a < b;
    case '>=': return a >= b;
    case '<=': return a <= b;
    default: return false;
  }
}

/**
 * 递归求值 AST
 * @param node - AST 节点
 * @param resolve - 变量解析函数
 * @returns 求值结果（布尔或字面量值）
 */
function evalNode(node: Node, resolve: ConditionResolver): unknown {
  switch (node.kind) {
    case 'literal':
      return node.value;
    case 'var':
      return resolve(node.path);
    case 'not':
      return !isTruthy(evalNode(node.operand, resolve));
    case 'logic': {
      const left = isTruthy(evalNode(node.left, resolve));
      if (node.op === '&&') {
        // 短路：左假则整体为假，不求值右侧
        if (!left) return false;
        return isTruthy(evalNode(node.right, resolve));
      }
      // 短路：左真则整体为真，不求值右侧
      if (left) return true;
      return isTruthy(evalNode(node.right, resolve));
    }
    case 'compare': {
      const l = evalNode(node.left, resolve);
      const r = evalNode(node.right, resolve);
      switch (node.op) {
        case '==': return looseEquals(l, r);
        case '!=': return !looseEquals(l, r);
        default: return orderCompare(l, r, node.op);
      }
    }
  }
}

/**
 * 解析并求值条件表达式
 * @param expr - 条件表达式字符串
 * @param resolve - 变量解析函数（未定义变量返回 undefined）
 * @returns 布尔结果
 */
export function evaluateCondition(expr: string, resolve: ConditionResolver): boolean {
  const tokens = tokenize(expr);
  const ast = new Parser(tokens).parse();
  const result = evalNode(ast, resolve);
  return isTruthy(result);
}

/**
 * 提取表达式中引用的所有变量路径
 * @param expr - 条件表达式字符串
 * @returns 变量路径数组（去重）
 */
export function extractConditionVars(expr: string): string[] {
  const vars: string[] = [];
  let pos = 0;
  while (pos < expr.length) {
    const idx = expr.indexOf('{{', pos);
    if (idx === -1) break;
    const match = VAR_REF_REGEX.exec(expr.slice(idx));
    if (match) {
      vars.push(match[1]);
      pos = idx + match[0].length;
    } else {
      pos = idx + 2;
    }
  }
  return [...new Set(vars)];
}
