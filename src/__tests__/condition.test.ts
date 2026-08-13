/**
 * 条件表达式求值器单元测试
 */

import { describe, it, expect } from 'vitest';
import { evaluateCondition, extractConditionVars, ConditionSyntaxError } from '../core/blocks/control/condition.js';

/** 从普通对象构建变量解析函数 */
function resolverOf(data: Record<string, unknown>): (path: string) => unknown {
  return (path: string) => {
    const parts = path.split('.');
    let current: unknown = data;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  };
}

describe('condition evaluator', () => {
  describe('literals', () => {
    it('should evaluate boolean literals', () => {
      expect(evaluateCondition('true', resolverOf({}))).toBe(true);
      expect(evaluateCondition('false', resolverOf({}))).toBe(false);
    });

    it('should evaluate null literal as falsy', () => {
      expect(evaluateCondition('null', resolverOf({}))).toBe(false);
    });

    it('should evaluate number literals as truthy (non-zero)', () => {
      expect(evaluateCondition('42', resolverOf({}))).toBe(true);
      expect(evaluateCondition('0', resolverOf({}))).toBe(false);
    });

    it('should evaluate string literals', () => {
      expect(evaluateCondition("'hello'", resolverOf({}))).toBe(true);
      expect(evaluateCondition("''", resolverOf({}))).toBe(false);
    });
  });

  describe('comparisons', () => {
    it('should compare numbers with > < >= <=', () => {
      expect(evaluateCondition('5 > 3', resolverOf({}))).toBe(true);
      expect(evaluateCondition('3 > 5', resolverOf({}))).toBe(false);
      expect(evaluateCondition('3 < 5', resolverOf({}))).toBe(true);
      expect(evaluateCondition('5 >= 5', resolverOf({}))).toBe(true);
      expect(evaluateCondition('5 <= 4', resolverOf({}))).toBe(false);
    });

    it('should compare numbers with == and !=', () => {
      expect(evaluateCondition('5 == 5', resolverOf({}))).toBe(true);
      expect(evaluateCondition('5 != 6', resolverOf({}))).toBe(true);
    });

    it('should compare strings with ==', () => {
      expect(evaluateCondition("'a' == 'a'", resolverOf({}))).toBe(true);
      expect(evaluateCondition("'a' != 'b'", resolverOf({}))).toBe(true);
    });

    it('should compare string to number loosely', () => {
      expect(evaluateCondition("'5' == 5", resolverOf({}))).toBe(true);
      expect(evaluateCondition("'abc' == 5", resolverOf({}))).toBe(false);
    });
  });

  describe('variables', () => {
    it('should resolve simple variables', () => {
      expect(evaluateCondition('{{score}} > 80', resolverOf({ score: 90 }))).toBe(true);
      expect(evaluateCondition('{{score}} > 80', resolverOf({ score: 70 }))).toBe(false);
    });

    it('should resolve deeply nested paths', () => {
      const data = { user: { profile: { age: 30 } } };
      expect(evaluateCondition('{{user.profile.age}} >= 18', resolverOf(data))).toBe(true);
      expect(evaluateCondition('{{user.profile.age}} < 18', resolverOf(data))).toBe(false);
    });

    it('should resolve array index access', () => {
      const data = { items: [{ price: 100 }, { price: 200 }] };
      expect(evaluateCondition('{{items.0.price}} > 50', resolverOf(data))).toBe(true);
      expect(evaluateCondition('{{items.1.price}} < 150', resolverOf(data))).toBe(false);
    });

    it('should treat undefined variable as falsy', () => {
      expect(evaluateCondition('{{missing}}', resolverOf({}))).toBe(false);
    });

    it('should treat undefined variable comparison as false', () => {
      expect(evaluateCondition('{{missing}} > 80', resolverOf({}))).toBe(false);
      expect(evaluateCondition('{{missing}} == 80', resolverOf({}))).toBe(false);
      expect(evaluateCondition('{{missing}} != 80', resolverOf({}))).toBe(true);
    });

    it('should compare variable to string', () => {
      expect(evaluateCondition("{{status}} == 'active'", resolverOf({ status: 'active' }))).toBe(true);
      expect(evaluateCondition("{{status}} == 'inactive'", resolverOf({ status: 'active' }))).toBe(false);
    });
  });

  describe('boolean logic', () => {
    it('should support &&', () => {
      expect(evaluateCondition('true && true', resolverOf({}))).toBe(true);
      expect(evaluateCondition('true && false', resolverOf({}))).toBe(false);
    });

    it('should support ||', () => {
      expect(evaluateCondition('false || true', resolverOf({}))).toBe(true);
      expect(evaluateCondition('false || false', resolverOf({}))).toBe(false);
    });

    it('should support ! negation', () => {
      expect(evaluateCondition('!false', resolverOf({}))).toBe(true);
      expect(evaluateCondition('!true', resolverOf({}))).toBe(false);
    });

    it('should short-circuit && (right side not evaluated when left false)', () => {
      expect(evaluateCondition('false && {{undefined_var}} > 0', resolverOf({}))).toBe(false);
    });

    it('should short-circuit || (right side not evaluated when left true)', () => {
      expect(evaluateCondition('true || {{undefined_var}} > 0', resolverOf({}))).toBe(true);
    });

    it('should support parentheses for grouping', () => {
      expect(evaluateCondition('(1 < 2) && (3 > 2)', resolverOf({}))).toBe(true);
      expect(evaluateCondition('(1 > 2) || (3 > 2)', resolverOf({}))).toBe(true);
    });

    it('should respect operator precedence (! > compare > && > ||)', () => {
      // ! 优先级高于比较
      expect(evaluateCondition('!false == true', resolverOf({}))).toBe(true);
      // 比较优先级高于 &&
      expect(evaluateCondition('1 < 2 && 3 < 4', resolverOf({}))).toBe(true);
      // && 优先级高于 ||
      expect(evaluateCondition('true || false && false', resolverOf({}))).toBe(true);
    });
  });

  describe('invalid expressions', () => {
    it('should reject function calls', () => {
      expect(() => evaluateCondition('someFn()', resolverOf({}))).toThrow(ConditionSyntaxError);
    });

    it('should reject assignments', () => {
      expect(() => evaluateCondition('x = 5', resolverOf({}))).toThrow(ConditionSyntaxError);
    });

    it('should reject unknown identifiers', () => {
      expect(() => evaluateCondition('foo bar', resolverOf({}))).toThrow(ConditionSyntaxError);
    });

    it('should reject trailing garbage', () => {
      expect(() => evaluateCondition('5 + 3', resolverOf({}))).toThrow(ConditionSyntaxError);
    });

    it('should reject unterminated string', () => {
      expect(() => evaluateCondition("'unterminated", resolverOf({}))).toThrow(ConditionSyntaxError);
    });

    it('should reject unbalanced parentheses', () => {
      expect(() => evaluateCondition('(1 < 2', resolverOf({}))).toThrow(ConditionSyntaxError);
    });

    it('should include position in error', () => {
      try {
        evaluateCondition('foo', resolverOf({}));
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(ConditionSyntaxError);
        expect((err as ConditionSyntaxError).pos).toBe(0);
      }
    });
  });
});

describe('extractConditionVars', () => {
  it('should extract variable paths', () => {
    expect(extractConditionVars('{{score}} > 80 && {{user.age}} > 18')).toEqual(['score', 'user.age']);
  });

  it('should deduplicate variables', () => {
    expect(extractConditionVars('{{a}} == {{a}}')).toEqual(['a']);
  });

  it('should return empty array when no variables', () => {
    expect(extractConditionVars('5 > 3')).toEqual([]);
  });
});

describe('parse depth limit', () => {
  it('should reject deeply nested parens instead of stack overflow', () => {
    // 65 层嵌套括号（超过 MAX_PARSE_DEPTH=64）
    const expr = '('.repeat(65) + '1 == 1' + ')'.repeat(65);
    expect(() => evaluateCondition(expr, () => undefined)).toThrow(ConditionSyntaxError);
  });

  it('should allow reasonable nesting depth', () => {
    // 10 层嵌套应正常
    const expr = '('.repeat(10) + '1 == 1' + ')'.repeat(10);
    expect(evaluateCondition(expr, () => undefined)).toBe(true);
  });
});
