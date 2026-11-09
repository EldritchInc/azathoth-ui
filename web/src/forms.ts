/**
 * What a step's form shows and reads back: paths and constants as a person
 * types them, the outputs a step can read, and a prompt split around its
 * variables.
 */

import {
  asList,
  asObject,
  asText,
  idOf,
  stepsOf,
  upstreamOf,
  type JsonObject,
  type JsonValue,
} from "./editing";
import { titleOf } from "./problems";

/** Where in a step's reply an output is found: keys of objects, and places in lists. */
export type Path = readonly (string | number)[];

const PLACE = /^(0|[1-9]\d*)$/;

/**
 * Returns a path from how a person types it: its parts between dots, where
 * a whole number is a place in a list. Nothing typed is the whole reply.
 */
export function parsePath(text: string): Path {
  return text === "" ? [] : text.split(".").map((part) => (PLACE.test(part) ? Number(part) : part));
}

/** Returns a path as a person types it, or `""` for the whole reply. */
export function formatPath(path: JsonValue | undefined): string {
  return asList(path)
    .map((part) => (typeof part === "number" ? String(part) : (asText(part) ?? "")))
    .join(".");
}

/** Returns a constant from how a person types it: JSON when it is JSON, else the text itself. */
export function parseConstant(text: string): JsonValue {
  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return text;
  }
}

/**
 * Returns a constant as a person types it: text as it is, unless it would
 * read back as something else, and anything else as JSON.
 */
export function formatConstant(value: JsonValue): string {
  if (typeof value === "string" && parseConstant(value) === value) {
    return value;
  }
  return JSON.stringify(value);
}

/** One output a step could read: which step writes it, and under what name. */
export interface Choice {
  readonly step: string;
  readonly title: string;
  readonly name: string;
  /** Whether the step already runs after the one that writes it. */
  readonly upstream: boolean;
}

/**
 * Returns the outputs of other steps one step could read without making a
 * circle: those of the steps it runs after first, then the rest, each in
 * the document's order.
 */
export function sourceChoices(document: JsonObject, id: string): Choice[] {
  const upstream = upstreamOf(document, id);
  const choices = stepsOf(document).flatMap((step): Choice[] => {
    const producer = idOf(step);

    if (producer === id || upstreamOf(document, producer).has(id)) {
      return [];
    }
    return asList(step.outputs).flatMap((output) => {
      const name = asText(asObject(output).name);

      return name === null || name === ""
        ? []
        : [{ step: producer, title: titleOf(step), name, upstream: upstream.has(producer) }];
    });
  });

  return [...choices.filter((choice) => choice.upstream), ...choices.filter((c) => !c.upstream)];
}

/** Returns the names the steps a step runs after directly write, each once. */
export function namesFromDependencies(document: JsonObject, id: string): string[] {
  const steps = stepsOf(document);
  const dependencies = asList(steps.find((step) => idOf(step) === id)?.depends_on);
  const names = steps
    .filter((step) => dependencies.includes(idOf(step)))
    .flatMap((step) => asList(step.outputs).map((output) => asText(asObject(output).name) ?? ""))
    .filter((name) => name !== "");

  return [...new Set(names)];
}

/** A run of a prompt's text: plain text, or a `{variable}` with its name. */
export interface Part {
  readonly text: string;
  readonly variable: string | null;
}

/**
 * Returns a prompt's text in runs, plain and variable, which joined are the
 * text again. A doubled brace is plain, as `variablesOf` reads it, and so is
 * a brace never closed.
 */
export function highlightParts(prompt: string): Part[] {
  const parts: Part[] = [];
  let plain = "";
  let index = 0;

  const flush = (): void => {
    if (plain !== "") {
      parts.push({ text: plain, variable: null });
      plain = "";
    }
  };

  while (index < prompt.length) {
    const character = prompt[index] ?? "";
    const next = prompt[index + 1];

    if ((character === "{" && next === "{") || (character === "}" && next === "}")) {
      plain += prompt.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (character === "{") {
      const end = prompt.indexOf("}", index + 1);

      if (end === -1) {
        break;
      }

      const name = (prompt.slice(index + 1, end).split(/[!:]/, 1)[0] ?? "").trim();

      if (name !== "") {
        flush();
        parts.push({ text: prompt.slice(index, end + 1), variable: name });
      } else {
        plain += prompt.slice(index, end + 1);
      }
      index = end + 1;
      continue;
    }
    plain += character;
    index += 1;
  }
  plain += prompt.slice(index);
  flush();
  return parts;
}
