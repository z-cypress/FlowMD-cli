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
});
