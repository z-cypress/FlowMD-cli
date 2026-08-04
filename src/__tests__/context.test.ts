/**
 * ExecutionContext unit tests
 */

import { describe, it, expect } from 'vitest';
import { ExecutionContext } from '../core/context.js';

describe('ExecutionContext', () => {
  describe('set and get', () => {
    it('should set and get a simple value', () => {
      const ctx = new ExecutionContext();
      ctx.set('name', 'Alice');

      expect(ctx.get('name')).toBe('Alice');
    });

    it('should return undefined for non-existent key', () => {
      const ctx = new ExecutionContext();

      expect(ctx.get('nonexistent')).toBeUndefined();
    });

    it('should overwrite existing value', () => {
      const ctx = new ExecutionContext();
      ctx.set('name', 'Alice');
      ctx.set('name', 'Bob');

      expect(ctx.get('name')).toBe('Bob');
    });

    it('should store different types', () => {
      const ctx = new ExecutionContext();
      ctx.set('string', 'hello');
      ctx.set('number', 42);
      ctx.set('boolean', true);
      ctx.set('null', null);
      ctx.set('array', [1, 2, 3]);

      expect(ctx.get('string')).toBe('hello');
      expect(ctx.get('number')).toBe(42);
      expect(ctx.get('boolean')).toBe(true);
      expect(ctx.get('null')).toBeNull();
      expect(ctx.get('array')).toEqual([1, 2, 3]);
    });
  });

  describe('render', () => {
    it('should replace simple variables', () => {
      const ctx = new ExecutionContext();
      ctx.set('name', 'Alice');

      expect(ctx.render('Hello {{name}}!')).toBe('Hello Alice!');
    });

    it('should replace multiple variables', () => {
      const ctx = new ExecutionContext();
      ctx.set('name', 'Alice');
      ctx.set('age', 30);

      expect(ctx.render('{{name}} is {{age}} years old')).toBe('Alice is 30 years old');
    });

    it('should keep placeholder if variable not found', () => {
      const ctx = new ExecutionContext();

      expect(ctx.render('Hello {{name}}!')).toBe('Hello {{name}}!');
    });

    it('should handle nested variables with dot notation', () => {
      const ctx = new ExecutionContext();
      ctx.set('user', { name: 'Alice', email: 'alice@example.com' });

      expect(ctx.render('{{user.name}}')).toBe('Alice');
      expect(ctx.render('{{user.email}}')).toBe('alice@example.com');
    });

    it('should resolve variables injected directly with dotted keys', () => {
      // 模拟 --var user.name=Alice 的注入方式（整键存储）
      const ctx = new ExecutionContext();
      ctx.set('user.name', 'Alice');

      expect(ctx.render('{{user.name}}')).toBe('Alice');
    });

    it('should handle deeply nested variables', () => {
      const ctx = new ExecutionContext();
      ctx.set('config', { database: { host: 'localhost', port: 5432 } });

      expect(ctx.render('{{config.database.host}}')).toBe('localhost');
      expect(ctx.render('{{config.database.port}}')).toBe('5432');
    });

    it('should serialize objects as JSON', () => {
      const ctx = new ExecutionContext();
      ctx.set('data', { id: 1, name: 'Test' });

      const result = ctx.render('{{data}}');
      expect(result).toContain('"id": 1');
      expect(result).toContain('"name": "Test"');
    });

    it('should serialize empty array as []', () => {
      const ctx = new ExecutionContext();
      ctx.set('items', []);

      expect(ctx.render('{{items}}')).toBe('[]');
    });

    it('should serialize small array (≤10) with formatting', () => {
      const ctx = new ExecutionContext();
      ctx.set('items', [1, 2, 3]);

      const result = ctx.render('{{items}}');
      expect(result).toContain('[\n');
      expect(result).toContain('1');
      expect(result).toContain('3');
    });

    it('should serialize large array (>10) compactly', () => {
      const ctx = new ExecutionContext();
      ctx.set('items', Array.from({ length: 20 }, (_, i) => i));

      const result = ctx.render('{{items}}');
      // 大数组应该紧凑（无换行缩进）
      expect(result).not.toContain('\n  ');
      // 但仍然包含数据
      expect(result).toContain('0');
      expect(result).toContain('19');
    });

    it('should serialize null as "null"', () => {
      const ctx = new ExecutionContext();
      ctx.set('val', null);

      expect(ctx.render('{{val}}')).toBe('null');
    });

    it('should serialize boolean values', () => {
      const ctx = new ExecutionContext();
      ctx.set('flag', true);
      ctx.set('off', false);

      expect(ctx.render('{{flag}}')).toBe('true');
      expect(ctx.render('{{off}}')).toBe('false');
    });

    it('should serialize number values', () => {
      const ctx = new ExecutionContext();
      ctx.set('count', 42);
      ctx.set('pi', 3.14);

      expect(ctx.render('{{count}}')).toBe('42');
      expect(ctx.render('{{pi}}')).toBe('3.14');
    });

    it('should keep placeholder if nested path intermediate is null', () => {
      const ctx = new ExecutionContext();
      ctx.set('user', null);

      expect(ctx.render('{{user.name}}')).toBe('{{user.name}}');
    });

    it('should keep placeholder if nested path intermediate is undefined', () => {
      const ctx = new ExecutionContext();
      ctx.set('user', {});

      expect(ctx.render('{{user.name}}')).toBe('{{user.name}}');
    });

    it('should handle no variables in template', () => {
      const ctx = new ExecutionContext();

      expect(ctx.render('No variables here')).toBe('No variables here');
    });

    it('should handle empty template', () => {
      const ctx = new ExecutionContext();

      expect(ctx.render('')).toBe('');
    });

    it('should convert numbers to strings', () => {
      const ctx = new ExecutionContext();
      ctx.set('count', 42);

      expect(ctx.render('Count: {{count}}')).toBe('Count: 42');
    });

    it('should convert booleans to strings', () => {
      const ctx = new ExecutionContext();
      ctx.set('active', true);

      expect(ctx.render('Active: {{active}}')).toBe('Active: true');
    });
  });

  describe('resolve', () => {
    it('should resolve simple values', () => {
      const ctx = new ExecutionContext();
      ctx.set('name', 'Alice');

      expect(ctx.resolve('name')).toBe('Alice');
    });

    it('should resolve deeply nested paths', () => {
      const ctx = new ExecutionContext();
      ctx.set('user', { profile: { age: 30 } });

      expect(ctx.resolve('user.profile.age')).toBe(30);
    });

    it('should resolve array index access', () => {
      const ctx = new ExecutionContext();
      ctx.set('items', [{ price: 100 }, { price: 200 }]);

      expect(ctx.resolve('items.0.price')).toBe(100);
      expect(ctx.resolve('items.1.price')).toBe(200);
    });

    it('should resolve dotted keys injected directly', () => {
      const ctx = new ExecutionContext();
      ctx.set('user.name', 'Alice');

      expect(ctx.resolve('user.name')).toBe('Alice');
    });

    it('should return undefined for missing paths', () => {
      const ctx = new ExecutionContext();

      expect(ctx.resolve('missing')).toBeUndefined();
      expect(ctx.resolve('user.nope')).toBeUndefined();
      expect(ctx.resolve('a.b.c')).toBeUndefined();
    });
  });

  describe('dump', () => {
    it('should return empty object when no variables set', () => {
      const ctx = new ExecutionContext();

      expect(ctx.dump()).toEqual({});
    });

    it('should return all variables as plain object', () => {
      const ctx = new ExecutionContext();
      ctx.set('name', 'Alice');
      ctx.set('age', 30);

      expect(ctx.dump()).toEqual({ name: 'Alice', age: 30 });
    });

    it('should return a copy, not reference to internal store', () => {
      const ctx = new ExecutionContext();
      ctx.set('name', 'Alice');

      const dumped = ctx.dump();
      dumped.name = 'Bob';

      expect(ctx.get('name')).toBe('Alice');
    });
  });

  describe('edge cases', () => {
    it('should handle variable name with underscores', () => {
      const ctx = new ExecutionContext();
      ctx.set('user_name', 'Alice');

      expect(ctx.render('{{user_name}}')).toBe('Alice');
    });

    it('should handle variable name with numbers', () => {
      const ctx = new ExecutionContext();
      ctx.set('item1', 'first');

      expect(ctx.render('{{item1}}')).toBe('first');
    });

    it('should handle multiple same variables', () => {
      const ctx = new ExecutionContext();
      ctx.set('x', 'hello');

      expect(ctx.render('{{x}} {{x}} {{x}}')).toBe('hello hello hello');
    });

    it('should handle adjacent variables', () => {
      const ctx = new ExecutionContext();
      ctx.set('a', 'A');
      ctx.set('b', 'B');

      expect(ctx.render('{{a}}{{b}}')).toBe('AB');
    });
  });

  describe('pipe filters', () => {
    describe('len', () => {
      it('should return array length', () => {
        const ctx = new ExecutionContext();
        ctx.set('items', [1, 2, 3]);
        expect(ctx.render('{{items | len}}')).toBe('3');
      });

      it('should return string length', () => {
        const ctx = new ExecutionContext();
        ctx.set('name', 'hi');
        expect(ctx.render('{{name | len}}')).toBe('2');
      });

      it('should return 0 for undefined', () => {
        const ctx = new ExecutionContext();
        expect(ctx.render('{{x | len}}')).toBe('0');
      });

      it('should return 0 for null', () => {
        const ctx = new ExecutionContext();
        ctx.set('x', null);
        expect(ctx.render('{{x | len}}')).toBe('0');
      });
    });

    describe('default', () => {
      it('should return default when undefined', () => {
        const ctx = new ExecutionContext();
        expect(ctx.render('{{x | default:N/A}}')).toBe('N/A');
      });

      it('should return default when null', () => {
        const ctx = new ExecutionContext();
        ctx.set('x', null);
        expect(ctx.render('{{x | default:N/A}}')).toBe('N/A');
      });

      it('should return default when empty string', () => {
        const ctx = new ExecutionContext();
        ctx.set('x', '');
        expect(ctx.render('{{x | default:N/A}}')).toBe('N/A');
      });

      it('should return value when defined', () => {
        const ctx = new ExecutionContext();
        ctx.set('x', 'hello');
        expect(ctx.render('{{x | default:N/A}}')).toBe('hello');
      });

      it('should work with nested paths', () => {
        const ctx = new ExecutionContext();
        expect(ctx.render('{{user.name | default:anon}}')).toBe('anon');
      });
    });

    describe('join', () => {
      it('should join array with default separator', () => {
        const ctx = new ExecutionContext();
        ctx.set('items', ['a', 'b', 'c']);
        expect(ctx.render('{{items | join}}')).toBe('a, b, c');
      });

      it('should join array with custom separator', () => {
        const ctx = new ExecutionContext();
        ctx.set('items', ['a', 'b', 'c']);
        expect(ctx.render('{{items | join:-}}')).toBe('a-b-c');
      });

      it('should return non-array value as-is', () => {
        const ctx = new ExecutionContext();
        ctx.set('x', 'hello');
        expect(ctx.render('{{x | join:-}}')).toBe('hello');
      });
    });

    describe('round', () => {
      it('should round to integer by default', () => {
        const ctx = new ExecutionContext();
        ctx.set('pi', 3.7);
        expect(ctx.render('{{pi | round}}')).toBe('4');
      });

      it('should round to specified decimals', () => {
        const ctx = new ExecutionContext();
        ctx.set('pi', 3.14159);
        expect(ctx.render('{{pi | round:2}}')).toBe('3.14');
      });

      it('should handle string numbers', () => {
        const ctx = new ExecutionContext();
        ctx.set('x', '3.7');
        expect(ctx.render('{{x | round}}')).toBe('4');
      });
    });

    describe('upper/lower', () => {
      it('should convert to uppercase', () => {
        const ctx = new ExecutionContext();
        ctx.set('x', 'hello');
        expect(ctx.render('{{x | upper}}')).toBe('HELLO');
      });

      it('should convert to lowercase', () => {
        const ctx = new ExecutionContext();
        ctx.set('x', 'HELLO');
        expect(ctx.render('{{x | lower}}')).toBe('hello');
      });
    });

    describe('truncate', () => {
      it('should truncate long strings', () => {
        const ctx = new ExecutionContext();
        ctx.set('text', 'hello world');
        expect(ctx.render('{{text | truncate:5}}')).toBe('hello...');
      });

      it('should not truncate short strings', () => {
        const ctx = new ExecutionContext();
        ctx.set('text', 'hi');
        expect(ctx.render('{{text | truncate:5}}')).toBe('hi');
      });

      it('should default to 100 chars', () => {
        const ctx = new ExecutionContext();
        ctx.set('text', 'a'.repeat(101));
        expect(ctx.render('{{text | truncate}}')).toBe('a'.repeat(100) + '...');
      });
    });

    describe('unknown filter', () => {
      it('should keep original placeholder for unknown filter', () => {
        const ctx = new ExecutionContext();
        ctx.set('x', 'hello');
        expect(ctx.render('{{x | unknown}}')).toBe('{{x | unknown}}');
      });
    });

    describe('plain variable still works', () => {
      it('should render variables without filters', () => {
        const ctx = new ExecutionContext();
        ctx.set('name', 'Alice');
        expect(ctx.render('Hello {{name}}!')).toBe('Hello Alice!');
      });
    });
  });
});
