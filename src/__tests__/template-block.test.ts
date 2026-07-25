/**
 * Template block executor unit tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { executeTemplateBlock } from '../core/blocks/template-block.js';
import { ExecutionContext } from '../core/context.js';

describe('executeTemplateBlock', () => {
  let context: ExecutionContext;

  beforeEach(() => {
    context = new ExecutionContext();
  });

  describe('basic rendering', () => {
    it('should render simple template with variables', async () => {
      context.set('name', 'Alice');
      context.set('age', 30);

      const result = await executeTemplateBlock(
        'Hello {{name}}, you are {{age}} years old.',
        {},
        context
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe('Hello Alice, you are 30 years old.');
    });

    it('should render template with no variables', async () => {
      const result = await executeTemplateBlock(
        'No variables here.',
        {},
        context
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe('No variables here.');
    });

    it('should render empty template', async () => {
      const result = await executeTemplateBlock(
        '',
        {},
        context
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe('');
    });
  });

  describe('Handlebars features', () => {
    it('should render with conditionals', async () => {
      context.set('showDetails', true);

      const result = await executeTemplateBlock(
        'Header{{#if showDetails}} with details{{/if}}',
        {},
        context
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe('Header with details');
    });

    it('should render with loops', async () => {
      context.set('items', ['apple', 'banana', 'cherry']);

      const result = await executeTemplateBlock(
        '{{#each items}}{{this}} {{/each}}',
        {},
        context
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe('apple banana cherry ');
    });

    it('should render with nested objects', async () => {
      context.set('user', { name: 'Alice', email: 'alice@example.com' });

      const result = await executeTemplateBlock(
        '{{user.name}} ({{user.email}})',
        {},
        context
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe('Alice (alice@example.com)');
    });
  });

  describe('output configuration', () => {
    it('should store result in context if output is specified', async () => {
      context.set('greeting', 'Hello');

      await executeTemplateBlock(
        '{{greeting}} World!',
        { output: 'result' },
        context
      );

      expect(context.get('result')).toBe('Hello World!');
    });

    it('should not store result if output is not specified', async () => {
      await executeTemplateBlock(
        'No output config',
        {},
        context
      );

      expect(context.get('result')).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should handle invalid Handlebars syntax', async () => {
      const result = await executeTemplateBlock(
        '{{#if}} Missing closing tag',
        {},
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle unclosed blocks', async () => {
      const result = await executeTemplateBlock(
        '{{#each items}} Item',
        {},
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('multiline templates', () => {
    it('should render multiline template', async () => {
      context.set('title', 'Report');
      context.set('content', 'Some content');

      const result = await executeTemplateBlock(
        '# {{title}}\n\n{{content}}\n\n---\nEnd of report.',
        {},
        context
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain('# Report');
      expect(result.output).toContain('Some content');
      expect(result.output).toContain('End of report.');
    });
  });

  describe('json helper', () => {
    it('should serialize object to formatted JSON', async () => {
      const context = new ExecutionContext();
      context.set('data', { name: 'Alice', age: 30 });

      const result = await executeTemplateBlock(
        '{{json data}}',
        {},
        context
      );
      expect(result.success).toBe(true);
      expect(result.output).toContain('"name": "Alice"');
      expect(result.output).toContain('"age": 30');
    });

    it('should serialize array to formatted JSON', async () => {
      const context = new ExecutionContext();
      context.set('items', [{ id: 1 }, { id: 2 }]);

      const result = await executeTemplateBlock(
        '{{json items}}',
        {},
        context
      );
      expect(result.success).toBe(true);
      expect(result.output).toContain('"id": 1');
      expect(result.output).toContain('"id": 2');
    });

    it('should handle null and undefined', async () => {
      const context = new ExecutionContext();
      context.set('x', null);

      const result = await executeTemplateBlock('{{json x}}', {}, context);
      expect(result.success).toBe(true);
      expect(result.output).toBe('');
    });
  });
});
