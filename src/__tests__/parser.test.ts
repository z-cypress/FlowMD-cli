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
