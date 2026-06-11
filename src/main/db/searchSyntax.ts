export type SearchToken =
  | { kind: "tag"; value: string }
  | { kind: "plus" }
  | { kind: "minus" }
  | { kind: "slash" }
  | { kind: "leftParen" }
  | { kind: "rightParen" };

export type SearchNode =
  | { kind: "tag"; value: string }
  | { kind: "not"; node: SearchNode }
  | { kind: "and"; left: SearchNode; right: SearchNode }
  | { kind: "or"; left: SearchNode; right: SearchNode };

export function tokenizeSearchQuery(
  query: string,
  normalizeValue: (value: string) => string,
): SearchToken[] {
  const tokens: SearchToken[] = [];
  let buffer = "";
  let quoted = false;
  let escaped = false;

  function flushBuffer(): void {
    const value = buffer.trim();

    if (value) {
      tokens.push({ kind: "tag", value: normalizeValue(value) });
    }

    buffer = "";
  }

  for (const character of query) {
    if (quoted) {
      if (escaped) {
        buffer += character;
        escaped = false;
        continue;
      }

      if (character === "\\") {
        escaped = true;
        continue;
      }

      if (character === '"') {
        quoted = false;
        flushBuffer();
        continue;
      }

      buffer += character;
      continue;
    }

    if (character === '"') {
      flushBuffer();
      quoted = true;
      continue;
    }

    if (character === "+") {
      flushBuffer();
      tokens.push({ kind: "plus" });
      continue;
    }

    if (character === "-") {
      flushBuffer();
      tokens.push({ kind: "minus" });
      continue;
    }

    if (character === "/") {
      flushBuffer();
      tokens.push({ kind: "slash" });
      continue;
    }

    if (character === "(") {
      flushBuffer();
      tokens.push({ kind: "leftParen" });
      continue;
    }

    if (character === ")") {
      flushBuffer();
      tokens.push({ kind: "rightParen" });
      continue;
    }

    buffer += character;
  }

  if (quoted && escaped) {
    buffer += "\\";
  }

  flushBuffer();

  return tokens;
}

export function parseSearchExpression(
  tokens: SearchToken[],
): SearchNode | null {
  let index = 0;

  function peek(): SearchToken | undefined {
    return tokens[index];
  }

  function consume(): SearchToken | undefined {
    const token = tokens[index];
    index += 1;
    return token;
  }

  function parsePrimary(): SearchNode | null {
    const token = peek();

    if (!token) {
      return null;
    }

    if (token.kind === "tag") {
      consume();
      return { kind: "tag", value: token.value };
    }

    if (token.kind === "leftParen") {
      consume();
      const expression = parseOr();

      if (peek()?.kind === "rightParen") {
        consume();
      }

      return expression;
    }

    return null;
  }

  function parseUnary(): SearchNode | null {
    const token = peek();

    if (token?.kind === "minus") {
      consume();
      const node = parseUnary();
      return node ? { kind: "not", node } : null;
    }

    return parsePrimary();
  }

  function startsExpression(token: SearchToken | undefined): boolean {
    return (
      token?.kind === "tag" ||
      token?.kind === "leftParen" ||
      token?.kind === "minus"
    );
  }

  function parseAnd(): SearchNode | null {
    let node = parseUnary();

    if (!node) {
      return null;
    }

    while (true) {
      const token = peek();

      if (token?.kind === "plus") {
        consume();
        const right = parseUnary();

        if (!right) {
          return node;
        }

        node = { kind: "and", left: node, right };
        continue;
      }

      if (startsExpression(token)) {
        const right = parseUnary();

        if (!right) {
          return node;
        }

        node = { kind: "and", left: node, right };
        continue;
      }

      return node;
    }
  }

  function parseOr(): SearchNode | null {
    let node = parseAnd();

    if (!node) {
      return null;
    }

    while (peek()?.kind === "slash") {
      consume();
      const right = parseAnd();

      if (!right) {
        return node;
      }

      node = { kind: "or", left: node, right };
    }

    return node;
  }

  return parseOr();
}

export function evaluateSearchNode(
  node: SearchNode,
  universe: Set<number>,
  tagIndex: Map<string, Set<number>>,
): Set<number> {
  if (node.kind === "tag") {
    return new Set(tagIndex.get(node.value) ?? []);
  }

  if (node.kind === "not") {
    return subtractSets(
      universe,
      evaluateSearchNode(node.node, universe, tagIndex),
    );
  }

  if (node.kind === "and") {
    return intersectSets(
      evaluateSearchNode(node.left, universe, tagIndex),
      evaluateSearchNode(node.right, universe, tagIndex),
    );
  }

  return unionSets(
    evaluateSearchNode(node.left, universe, tagIndex),
    evaluateSearchNode(node.right, universe, tagIndex),
  );
}

function intersectSets(left: Set<number>, right: Set<number>): Set<number> {
  const result = new Set<number>();
  const [smaller, larger] =
    left.size <= right.size ? [left, right] : [right, left];

  for (const value of smaller) {
    if (larger.has(value)) {
      result.add(value);
    }
  }

  return result;
}

function unionSets(left: Set<number>, right: Set<number>): Set<number> {
  return new Set([...left, ...right]);
}

function subtractSets(left: Set<number>, right: Set<number>): Set<number> {
  const result = new Set<number>();

  for (const value of left) {
    if (!right.has(value)) {
      result.add(value);
    }
  }

  return result;
}
