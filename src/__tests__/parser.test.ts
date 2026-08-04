/**
 * Parser unit tests
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseMarkdown } from '../core/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturesDir = join(__dirname, 'fixtures');

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

describe('parseMarkdown', () => {
  describe('simple.md - normal document with all block types', () => {
    it('should extract all three block types', () => {
      const content = loadFixture('simple.md');
      const doc = parseMarkdown(content);

      expect(doc.blocks).toHaveLength(3);
      expect(doc.blocks[0].type).toBe('data');
      expect(doc.blocks[1].type).toBe('ai');
      expect(doc.blocks[2].type).toBe('template');
    });

    it('should parse metadata correctly', () => {
      const content = loadFixture('simple.md');
      const doc = parseMarkdown(content);

      expect(doc.blocks[0].meta).toEqual({ from: 'default', output: 'sales' });
      expect(doc.blocks[1].meta).toEqual({ model: 'gpt-4o', output: 'summary' });
    });

    it('should extract variables from content', () => {
      const content = loadFixture('simple.md');
      const doc = parseMarkdown(content);

      expect(doc.variables).toContain('sales');
      expect(doc.variables).toContain('date');
      expect(doc.variables).toContain('total_revenue');
      expect(doc.variables).toContain('summary');
    });

    it('should preserve raw content', () => {
      const content = loadFixture('simple.md');
      const doc = parseMarkdown(content);

      expect(doc.rawContent).toBe(content);
    });
  });

  describe('no-blocks.md - document without executable blocks', () => {
    it('should return empty blocks array', () => {
      const content = loadFixture('no-blocks.md');
      const doc = parseMarkdown(content);

      expect(doc.blocks).toHaveLength(0);
    });

    it('should still extract variables if present', () => {
      const content = '# Hello {{name}}';
      const doc = parseMarkdown(content);

      expect(doc.blocks).toHaveLength(0);
      expect(doc.variables).toContain('name');
    });
  });

  describe('malformed-meta.md - metadata edge cases', () => {
    it('should handle missing closing brace gracefully', () => {
      const content = loadFixture('malformed-meta.md');
      const doc = parseMarkdown(content);

      // Should still detect the block
      expect(doc.blocks.length).toBeGreaterThanOrEqual(1);
      // Meta should be empty or incomplete
      expect(doc.blocks[0].meta).toBeDefined();
    });

    it('should handle block with no metadata', () => {
      const content = '```ai\nSimple AI block\n```';
      const doc = parseMarkdown(content);

      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0].type).toBe('ai');
      expect(doc.blocks[0].meta).toEqual({});
    });

    it('should keep commas inside quoted metadata values', () => {
      const content = '```ai {model: "gpt-4o,fast", output: "x"}\nprompt\n```';
      const doc = parseMarkdown(content);

      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0].meta.model).toBe('gpt-4o,fast');
      expect(doc.blocks[0].meta.output).toBe('x');
    });
  });

  describe('nested-vars.md - variable extraction', () => {
    it('should extract simple variables', () => {
      const content = loadFixture('nested-vars.md');
      const doc = parseMarkdown(content);

      expect(doc.variables).toContain('name');
      expect(doc.variables).toContain('age');
    });

    it('should extract nested variables with dots', () => {
      const content = loadFixture('nested-vars.md');
      const doc = parseMarkdown(content);

      expect(doc.variables).toContain('user.name');
      expect(doc.variables).toContain('user.email');
      expect(doc.variables).toContain('user.address.city');
    });

    it('should extract deeply nested variables', () => {
      const content = loadFixture('nested-vars.md');
      const doc = parseMarkdown(content);

      expect(doc.variables).toContain('config.database.host');
      expect(doc.variables).toContain('config.database.port');
    });

    it('should deduplicate variables', () => {
      const content = '{{name}} and {{name}} again';
      const doc = parseMarkdown(content);

      const nameCount = doc.variables.filter(v => v === 'name').length;
      expect(nameCount).toBe(1);
    });
  });

  describe('include blocks', () => {
    it('should recognize include blocks', () => {
      const content = 'Before\n\n```include {path: "./target.md"}\n```\n\nAfter';
      const doc = parseMarkdown(content);

      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0].type).toBe('include');
      expect(doc.blocks[0].meta.path).toBe('./target.md');
    });

    it('should preserve raw content with include blocks', () => {
      const content = '# Doc\n\n```include {path: "./shared.md"}\n```';
      const doc = parseMarkdown(content);

      expect(doc.rawContent).toBe(content);
    });

    it('should handle include blocks with no content', () => {
      // include blocks typically have empty content (just path in meta)
      const content = '```include {path: "./vars.yaml"}\n```';
      const doc = parseMarkdown(content);

      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0].type).toBe('include');
      expect(doc.blocks[0].content).toBe('');
    });
  });

  describe('run blocks', () => {
    it('should recognize run blocks and parse runtime', () => {
      const content = '```run {runtime: "python"}\nprint(1)\n```';
      const doc = parseMarkdown(content);

      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0].type).toBe('run');
      expect(doc.blocks[0].meta.runtime).toBe('python');
    });

    it('should parse vars as an array', () => {
      const content = '```run {runtime: "js", vars: ["a", "b"], output: "result"}\nconsole.log(a)\n```';
      const doc = parseMarkdown(content);

      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0].meta.vars).toEqual(['a', 'b']);
      expect(doc.blocks[0].meta.output).toBe('result');
    });

    it('should parse timeout and memory params', () => {
      const content = '```run {runtime: "python", timeout: 60, memory: 256}\nprint(1)\n```';
      const doc = parseMarkdown(content);

      expect(doc.blocks[0].meta.runtime).toBe('python');
      expect(doc.blocks[0].meta.timeout).toBe('60');
      expect(doc.blocks[0].meta.memory).toBe('256');
    });

    it('should run without any params', () => {
      const content = '```run\nprint("hello")\n```';
      const doc = parseMarkdown(content);

      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0].type).toBe('run');
      expect(doc.blocks[0].meta).toEqual({});
    });
  });

  describe('agent blocks', () => {
    it('should recognize agent blocks and parse goal/output', () => {
      const content = '```agent {goal: "收集竞品动态", output: "news"}\n任务要求...\n```';
      const doc = parseMarkdown(content);

      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0].type).toBe('agent');
      expect(doc.blocks[0].meta.goal).toBe('收集竞品动态');
      expect(doc.blocks[0].meta.output).toBe('news');
    });

    it('should parse tools as an array', () => {
      const content = '```agent {goal: "调研", tools: ["code_execution", "file_read"], output: "report", max_steps: 15}\n任务...\n```';
      const doc = parseMarkdown(content);

      expect(doc.blocks[0].meta.tools).toEqual(['code_execution', 'file_read']);
      expect(doc.blocks[0].meta.max_steps).toBe('15');
    });

    it('should recognize agent without params', () => {
      const content = '```agent\n任务描述\n```';
      const doc = parseMarkdown(content);

      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0].type).toBe('agent');
      expect(doc.blocks[0].meta).toEqual({});
    });
  });

  describe('YAML-backed metadata (1.3.3)', () => {
    it('should parse numeric and boolean values as strings', () => {
      const content = '```ai {temperature: 0.1, max_tokens: 1000, stream: true, retry: 3}\nprompt\n```';
      const doc = parseMarkdown(content);

      expect(doc.blocks[0].meta.temperature).toBe('0.1');
      expect(doc.blocks[0].meta.max_tokens).toBe('1000');
      expect(doc.blocks[0].meta.stream).toBe('true');
      expect(doc.blocks[0].meta.retry).toBe('3');
    });

    it('should parse nested objects as JSON strings', () => {
      const content = '```ai {schema: {type: "object", fields: ["a", "b"]}}\nprompt\n```';
      const doc = parseMarkdown(content);

      expect(doc.blocks[0].meta.schema).toBe('{"type":"object","fields":["a","b"]}');
    });

    it('should parse JSON-style quoted keys', () => {
      const content = '```ai {"output": "x", "model": "gpt-4o"}\nprompt\n```';
      const doc = parseMarkdown(content);

      expect(doc.blocks[0].meta).toEqual({ output: 'x', model: 'gpt-4o' });
    });

    it('should keep commas inside quoted values', () => {
      const content = '```ai {model: "gpt-4o,fast", output: "x"}\nprompt\n```';
      const doc = parseMarkdown(content);

      expect(doc.blocks[0].meta.model).toBe('gpt-4o,fast');
    });
  });

  describe('edge cases', () => {
    it('should handle empty content', () => {
      const doc = parseMarkdown('');

      expect(doc.blocks).toHaveLength(0);
      expect(doc.variables).toHaveLength(0);
      expect(doc.rawContent).toBe('');
    });

    it('should handle code blocks with null lang', () => {
      const content = '```\nsome code\n```';
      const doc = parseMarkdown(content);

      expect(doc.blocks).toHaveLength(0);
    });

    it('should handle variables with hyphens (now supported)', () => {
      const content = '{{invalid-var}} and {{valid_var}}';
      const doc = parseMarkdown(content);

      expect(doc.variables).toContain('invalid-var');
      expect(doc.variables).toContain('valid_var');
    });

    it('should assign correct positions to blocks', () => {
      const content = '```ai\nfirst\n```\n```data\nsecond\n```';
      const doc = parseMarkdown(content);

      expect(doc.blocks[0].position).toBe(0);
      expect(doc.blocks[1].position).toBe(1);
    });
  });
});
