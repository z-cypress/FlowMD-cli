/**
 * 控制指令解析与配对树单元测试
 */

import { describe, it, expect } from 'vitest';
import { parseDirective } from '../core/blocks/control/directives.js';
import { buildControlTree, ControlTreeError } from '../core/blocks/control/tree.js';
import { parseMarkdown } from '../core/parser.js';
import type { ParsedDocument, ControlNode, IfNode, ForNode } from '../types/index.js';

describe('parseDirective', () => {
  it('should parse if directive with condition', () => {
    const d = parseDirective('<!-- if: {{score}} > 80 -->', 0);
    expect(d).not.toBeNull();
    expect(d!.kind).toBe('if');
    expect(d!.condition).toBe('{{score}} > 80');
  });

  it('should parse if directive without colon', () => {
    const d = parseDirective('<!-- if {{score}} > 80 -->', 0);
    expect(d!.condition).toBe('{{score}} > 80');
  });

  it('should parse elif directive', () => {
    const d = parseDirective('<!-- elif: {{score}} > 60 -->', 10);
    expect(d!.kind).toBe('elif');
    expect(d!.condition).toBe('{{score}} > 60');
    expect(d!.sourceStart).toBe(10);
    expect(d!.sourceEnd).toBe(10 + '<!-- elif: {{score}} > 60 -->'.length);
  });

  it('should parse else and endif', () => {
    expect(parseDirective('<!-- else -->', 0)!.kind).toBe('else');
    expect(parseDirective('<!-- endif -->', 0)!.kind).toBe('endif');
  });

  it('should parse for directive with loop var and list', () => {
    const d = parseDirective('<!-- for: item in orders -->', 0);
    expect(d!.kind).toBe('for');
    expect(d!.loopVar).toBe('item');
    expect(d!.listExpr).toBe('orders');
  });

  it('should parse for directive with collect', () => {
    const d = parseDirective('<!-- for: item in orders {collect: "analyses"} -->', 0);
    expect(d!.kind).toBe('for');
    expect(d!.loopVar).toBe('item');
    expect(d!.listExpr).toBe('orders');
    expect(d!.collect).toBe('analyses');
  });

  it('should parse endfor', () => {
    expect(parseDirective('<!-- endfor -->', 0)!.kind).toBe('endfor');
  });

  it('should ignore plain HTML comments', () => {
    expect(parseDirective('<!-- 普通注释 -->', 0)).toBeNull();
    expect(parseDirective('<!-- note to maintainer -->', 0)).toBeNull();
  });

  it('should ignore non-comment html', () => {
    expect(parseDirective('<div>foo</div>', 0)).toBeNull();
  });

  it('should reject malformed if without condition', () => {
    expect(parseDirective('<!-- if: -->', 0)).toBeNull();
    expect(parseDirective('<!-- if -->', 0)).toBeNull();
  });

  it('should reject for without loop spec', () => {
    expect(parseDirective('<!-- for: -->', 0)).toBeNull();
    expect(parseDirective('<!-- for: item -->', 0)).toBeNull();
  });
});

describe('parseMarkdown directives collection', () => {
  it('should collect directives from HTML comments', () => {
    const doc = parseMarkdown([
      'Score: {{score}}',
      '',
      '<!-- if: {{score}} > 80 -->',
      '优秀',
      '<!-- endif -->',
    ].join('\n'));

    expect(doc.directives).toHaveLength(2);
    expect(doc.directives![0].kind).toBe('if');
    expect(doc.directives![1].kind).toBe('endif');
  });

  it('should preserve raw content', () => {
    const content = '<!-- if: {{x}} -->\nbody\n<!-- endif -->';
    const doc = parseMarkdown(content);
    expect(doc.rawContent).toBe(content);
  });
});

describe('buildControlTree', () => {
  function doc(content: string): ParsedDocument {
    return parseMarkdown(content);
  }

  function findIf(nodes: ControlNode[]): IfNode {
    const n = nodes.find((x) => x.kind === 'if') as IfNode | undefined;
    if (!n) throw new Error('no if node');
    return n;
  }

  function findFor(nodes: ControlNode[]): ForNode {
    const n = nodes.find((x) => x.kind === 'for') as ForNode | undefined;
    if (!n) throw new Error('no for node');
    return n;
  }

  it('should build simple if/else with blocks', () => {
    const d = doc([
      '<!-- if: {{score}} > 80 -->',
      '```ai {output: "a"}',
      'good',
      '```',
      '<!-- else -->',
      '```ai {output: "b"}',
      'bad',
      '```',
      '<!-- endif -->',
    ].join('\n'));

    const tree = buildControlTree(d);
    expect(tree).toHaveLength(1);
    const node = findIf(tree);
    expect(node.branches).toHaveLength(2);
    expect(node.branches[0].condition).toBe('{{score}} > 80');
    expect(node.branches[0].children).toHaveLength(1);
    expect(node.branches[0].children[0].kind).toBe('block');
    expect(node.branches[1].condition).toBeUndefined();
    expect(node.branches[1].children).toHaveLength(1);
  });

  it('should build elif chain', () => {
    const d = doc([
      '<!-- if: {{s}} > 80 -->',
      'a',
      '<!-- elif: {{s}} > 60 -->',
      'b',
      '<!-- elif: {{s}} > 40 -->',
      'c',
      '<!-- else -->',
      'd',
      '<!-- endif -->',
    ].join('\n'));

    const tree = buildControlTree(d);
    const node = findIf(tree);
    expect(node.branches).toHaveLength(4);
    expect(node.branches.map((b) => b.condition)).toEqual([
      '{{s}} > 80',
      '{{s}} > 60',
      '{{s}} > 40',
      undefined,
    ]);
  });

  it('should build for loop with collect', () => {
    const d = doc([
      '<!-- for: item in orders {collect: "analyses"} -->',
      '```ai {output: "a"}',
      'analyze {{item}}',
      '```',
      '{{a}}',
      '<!-- endfor -->',
    ].join('\n'));

    const tree = buildControlTree(d);
    const node = findFor(tree);
    expect(node.loopVar).toBe('item');
    expect(node.listExpr).toBe('orders');
    expect(node.collect).toBe('analyses');
    expect(node.children).toHaveLength(1);
    expect(node.children[0].kind).toBe('block');
  });

  it('should support nesting if inside for', () => {
    const d = doc([
      '<!-- for: item in list -->',
      '<!-- if: {{item.ok}} -->',
      'yes',
      '<!-- endif -->',
      '<!-- endfor -->',
    ].join('\n'));

    const tree = buildControlTree(d);
    const forNode = findFor(tree);
    expect(forNode.children).toHaveLength(1);
    expect(forNode.children[0].kind).toBe('if');
  });

  it('should support nesting for inside if', () => {
    const d = doc([
      '<!-- if: {{flag}} -->',
      '<!-- for: item in list -->',
      '{{item}}',
      '<!-- endfor -->',
      '<!-- endif -->',
    ].join('\n'));

    const tree = buildControlTree(d);
    const ifNode = findIf(tree);
    expect(ifNode.branches[0].children).toHaveLength(1);
    expect(ifNode.branches[0].children[0].kind).toBe('for');
  });

  it('should throw on unmatched endif', () => {
    const d = doc('<!-- endif -->');
    expect(() => buildControlTree(d)).toThrow(ControlTreeError);
    expect(() => buildControlTree(d)).toThrow(/endif/);
  });

  it('should throw on missing endif', () => {
    const d = doc('<!-- if: {{x}} -->\nbody');
    expect(() => buildControlTree(d)).toThrow(ControlTreeError);
    expect(() => buildControlTree(d)).toThrow(/endif/);
  });

  it('should throw on unmatched endfor', () => {
    const d = doc('<!-- endfor -->');
    expect(() => buildControlTree(d)).toThrow(ControlTreeError);
    expect(() => buildControlTree(d)).toThrow(/endfor/);
  });

  it('should throw on missing endfor', () => {
    const d = doc('<!-- for: x in list -->\nbody');
    expect(() => buildControlTree(d)).toThrow(ControlTreeError);
    expect(() => buildControlTree(d)).toThrow(/endfor/);
  });

  it('should throw on elif without enclosing if', () => {
    const d = doc('<!-- for: x in list -->\n<!-- elif: {{x}} -->\n<!-- endfor -->');
    expect(() => buildControlTree(d)).toThrow(ControlTreeError);
  });

  it('should throw on else after else', () => {
    const d = doc('<!-- if: {{x}} -->\na\n<!-- else -->\nb\n<!-- else -->\nc\n<!-- endif -->');
    expect(() => buildControlTree(d)).toThrow(ControlTreeError);
    expect(() => buildControlTree(d)).toThrow(/else/);
  });

  it('should throw on elif after else', () => {
    const d = doc('<!-- if: {{x}} -->\na\n<!-- else -->\nb\n<!-- elif: {{y}} -->\nc\n<!-- endif -->');
    expect(() => buildControlTree(d)).toThrow(ControlTreeError);
  });

  it('should throw when collect loop has multiple output blocks', () => {
    const d = doc([
      '<!-- for: item in list {collect: "all"} -->',
      '```ai {output: "a"}',
      'one',
      '```',
      '```ai {output: "b"}',
      'two',
      '```',
      '<!-- endfor -->',
    ].join('\n'));
    expect(() => buildControlTree(d)).toThrow(ControlTreeError);
    expect(() => buildControlTree(d)).toThrow(/collect/);
  });

  it('should throw when collect loop has no output block', () => {
    const d = doc([
      '<!-- for: item in list {collect: "all"} -->',
      '{{item}}',
      '<!-- endfor -->',
    ].join('\n'));
    expect(() => buildControlTree(d)).toThrow(ControlTreeError);
    expect(() => buildControlTree(d)).toThrow(/collect/);
  });

  it('should not count nested for outputs against outer collect', () => {
    const d = doc([
      '<!-- for: item in list {collect: "all"} -->',
      '```ai {output: "outer"}',
      'outer {{item}}',
      '```',
      '<!-- for: sub in sublist -->',
      '```ai {output: "inner"}',
      'inner',
      '```',
      '<!-- endfor -->',
      '<!-- endfor -->',
    ].join('\n'));
    const tree = buildControlTree(d);
    expect(tree).toHaveLength(1);
    expect(tree[0].kind).toBe('for');
  });

  it('should order blocks and directives by source', () => {
    const d = doc([
      '```ai {output: "first"}',
      'one',
      '```',
      '',
      '<!-- if: {{x}} -->',
      '```ai {output: "second"}',
      'two',
      '```',
      '<!-- endif -->',
    ].join('\n'));

    const tree = buildControlTree(d);
    expect(tree).toHaveLength(2);
    expect(tree[0].kind).toBe('block');
    expect(tree[1].kind).toBe('if');
  });
});
