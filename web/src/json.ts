/**
 * JSON, laid out and split into the pieces a highlighter colors.
 */

export type TokenKind = "key" | "string" | "number" | "literal" | "punctuation" | "space";

export interface Token {
  readonly kind: TokenKind;
  readonly text: string;
}

const TOKEN =
  /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(true|false|null)|([{}[\],:])|(\s+)/gy;

/** Returns a value as JSON indented by two spaces, as a person reads it. */
export function layOut(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/** Returns JSON text as tokens: keys, strings, numbers, literals, punctuation and space. */
export function tokenize(json: string): Token[] {
  const tokens: Token[] = [];
  TOKEN.lastIndex = 0;

  while (TOKEN.lastIndex < json.length) {
    const start = TOKEN.lastIndex;
    const match = TOKEN.exec(json);

    if (match === null) {
      tokens.push({ kind: "space", text: json.slice(start) });
      break;
    }

    const [, string, colon, number, literal, punctuation, space] = match;

    if (string !== undefined) {
      tokens.push({ kind: colon === undefined ? "string" : "key", text: string });

      if (colon !== undefined) {
        tokens.push({ kind: "punctuation", text: colon });
      }
    } else if (number !== undefined) {
      tokens.push({ kind: "number", text: number });
    } else if (literal !== undefined) {
      tokens.push({ kind: "literal", text: literal });
    } else if (punctuation !== undefined) {
      tokens.push({ kind: "punctuation", text: punctuation });
    } else {
      tokens.push({ kind: "space", text: space ?? "" });
    }
  }

  return tokens;
}
