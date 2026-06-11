import { describe, expect, it } from "vitest";
import {
  evaluateSearchNode,
  parseSearchExpression,
  tokenizeSearchQuery,
  type SearchNode,
} from "../src/main/db/searchSyntax.js";

const identity = (value: string): string => value;

function parse(query: string): SearchNode | null {
  return parseSearchExpression(tokenizeSearchQuery(query, identity));
}

describe("tokenizeSearchQuery", () => {
  it("splits tags and operators", () => {
    expect(tokenizeSearchQuery("foo + bar", identity)).toEqual([
      { kind: "tag", value: "foo" },
      { kind: "plus" },
      { kind: "tag", value: "bar" },
    ]);
  });

  it("treats minus, slash and parens as operators", () => {
    expect(tokenizeSearchQuery("-(a / b)", identity)).toEqual([
      { kind: "minus" },
      { kind: "leftParen" },
      { kind: "tag", value: "a" },
      { kind: "slash" },
      { kind: "tag", value: "b" },
      { kind: "rightParen" },
    ]);
  });

  it("keeps operator characters inside quotes literal", () => {
    expect(tokenizeSearchQuery('"a-b/c (x)"', identity)).toEqual([
      { kind: "tag", value: "a-b/c (x)" },
    ]);
  });

  it("supports escaped quotes inside quoted tags", () => {
    expect(tokenizeSearchQuery('"say \\"hi\\""', identity)).toEqual([
      { kind: "tag", value: 'say "hi"' },
    ]);
  });

  it("keeps whitespace inside a tag (spaces do not separate tags)", () => {
    expect(tokenizeSearchQuery("blue eyes", identity)).toEqual([
      { kind: "tag", value: "blue eyes" },
    ]);
  });

  it("applies the normalizer to each tag", () => {
    expect(
      tokenizeSearchQuery("Foo + BAR", (value) => value.toLowerCase()),
    ).toEqual([
      { kind: "tag", value: "foo" },
      { kind: "plus" },
      { kind: "tag", value: "bar" },
    ]);
  });
});

describe("parseSearchExpression", () => {
  it("treats plus and quoted adjacency as AND", () => {
    const expected: SearchNode = {
      kind: "and",
      left: { kind: "tag", value: "a" },
      right: { kind: "tag", value: "b" },
    };

    expect(parse('"a" "b"')).toEqual(expected);
    expect(parse("a + b")).toEqual(expected);
  });

  it("gives AND precedence over OR", () => {
    expect(parse("a + b / c")).toEqual({
      kind: "or",
      left: {
        kind: "and",
        left: { kind: "tag", value: "a" },
        right: { kind: "tag", value: "b" },
      },
      right: { kind: "tag", value: "c" },
    });
  });

  it("parses NOT tighter than AND", () => {
    expect(parse("-a + b")).toEqual({
      kind: "and",
      left: { kind: "not", node: { kind: "tag", value: "a" } },
      right: { kind: "tag", value: "b" },
    });
  });

  it("parses grouped expressions", () => {
    expect(parse("-(a / b) c")).toEqual({
      kind: "and",
      left: {
        kind: "not",
        node: {
          kind: "or",
          left: { kind: "tag", value: "a" },
          right: { kind: "tag", value: "b" },
        },
      },
      right: { kind: "tag", value: "c" },
    });
  });

  it("supports double negation", () => {
    expect(parse("--a")).toEqual({
      kind: "not",
      node: { kind: "not", node: { kind: "tag", value: "a" } },
    });
  });

  it("returns null for empty input", () => {
    expect(parse("")).toBeNull();
    expect(parse("()")).toBeNull();
  });
});

describe("evaluateSearchNode", () => {
  const universe = new Set([1, 2, 3, 4]);
  const tagIndex = new Map<string, Set<number>>([
    ["a", new Set([1, 2])],
    ["b", new Set([2, 3])],
  ]);

  function evaluate(query: string): number[] {
    const node = parse(query);

    if (!node) {
      throw new Error(`query did not parse: ${query}`);
    }

    return [...evaluateSearchNode(node, universe, tagIndex)].sort();
  }

  it("evaluates tag, and, or, not", () => {
    expect(evaluate("a")).toEqual([1, 2]);
    expect(evaluate("a + b")).toEqual([2]);
    expect(evaluate("a / b")).toEqual([1, 2, 3]);
    expect(evaluate("-a")).toEqual([3, 4]);
  });

  it("evaluates mixed not/and/or", () => {
    expect(evaluate("-a + b")).toEqual([3]);
    expect(evaluate("a / -b")).toEqual([1, 2, 4]);
    expect(evaluate("--a")).toEqual([1, 2]);
  });
});
