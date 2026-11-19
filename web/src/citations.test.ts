import { describe, expect, it } from "vitest";

import { citationOf, collectionLabel, isWebLink } from "./citations";
import { ANNOTATIONS, CITATION } from "./test/evidence";

describe("citationOf", () => {
  it("reads what a citation says, where it was found, and what it quotes", () => {
    expect(citationOf(CITATION)).toEqual({
      id: CITATION.id,
      description: "Supports: the printer is on fire.",
      source: "https://tickets.example.com/7",
      quote: "My printer is on fire.",
    });
  });

  it("reads a quote from a selector given alone, or among others", () => {
    const target = {
      source: "ni:///sha-256;abc",
      selector: { type: "TextQuoteSelector", exact: "x" },
    };
    const among = {
      source: "s3://bucket/key",
      selector: [
        { type: "TextPositionSelector", start: 0, end: 1 },
        { type: "TextQuoteSelector", exact: "y", prefix: "a" },
      ],
    };

    expect(citationOf({ id: "a", target }).quote).toBe("x");
    expect(citationOf({ id: "b", target: among }).quote).toBe("y");
  });

  it("gives nothing for what a citation does not say", () => {
    expect(citationOf({})).toEqual({ id: null, description: null, source: null, quote: null });
    expect(
      citationOf({ body: { value: 3 }, target: { source: 7, selector: [{ type: "Other" }] } }),
    ).toEqual({ id: null, description: null, source: null, quote: null });
  });
});

describe("isWebLink", () => {
  it("is true only for a page a browser can open", () => {
    expect(isWebLink("https://tickets.example.com/7")).toBe(true);
    expect(isWebLink("http://intranet/doc")).toBe(true);
    expect(isWebLink("ni:///sha-256;abc")).toBe(false);
    expect(isWebLink("s3://bucket/key?versionId=1")).toBe(false);
    expect(isWebLink("javascript:alert(1)")).toBe(false);
  });
});

describe("collectionLabel", () => {
  it("is how Azathoth sums up a run's citations, or nothing", () => {
    expect(collectionLabel(ANNOTATIONS)).toBe(ANNOTATIONS.collection.label);
    expect(collectionLabel({ ...ANNOTATIONS, collection: {} })).toBeNull();
  });
});
