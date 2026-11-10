import { describe, expect, it } from "vitest";

import {
  NO_FILTER,
  filterOf,
  formatPrice,
  formatTokens,
  keeps,
  labelOf,
  modelPath,
  nameOf,
  narrows,
  providersOf,
  searchOf,
  shownModels,
  type ModelFilter,
} from "./models";
import { BEDROCK_MODEL, LARGE_MODEL, SMALL_MODEL } from "./test/instances";

const MODELS = [SMALL_MODEL, BEDROCK_MODEL, LARGE_MODEL];

function shown(filter: Partial<ModelFilter>): string[] {
  return shownModels(MODELS, { ...NO_FILTER, ...filter }).map((model) => model.identifier);
}

describe("filterOf and searchOf", () => {
  it("read a filter from a page's address, and write it back", () => {
    const search = new URLSearchParams(
      "q=acme&provider=openrouter&reads=image&reads=text&can=tool_use&context=128000" +
        "&input=3&output=15.5&mine=1&sort=context",
    );
    const filter = filterOf(search);

    expect(filter).toEqual({
      text: "acme",
      provider: "openrouter",
      reads: ["image", "text"],
      can: ["tool_use"],
      context: 128000,
      inputPrice: 3,
      outputPrice: 15.5,
      mine: true,
      sort: "context",
    });
    expect(searchOf(filter).toString()).toBe(search.toString());
  });

  it("read nothing as no filter, and write no filter as nothing", () => {
    expect(filterOf(new URLSearchParams())).toEqual(NO_FILTER);
    expect(searchOf(NO_FILTER).toString()).toBe("");
  });

  it("leave out what they cannot read", () => {
    expect(
      filterOf(
        new URLSearchParams(
          "provider=&reads=smell&reads=text&reads=text&can=flight&context=lots&input=-1&mine=yes&sort=size",
        ),
      ),
    ).toEqual({ ...NO_FILTER, reads: ["text"] });
  });
});

describe("narrows", () => {
  it("says whether a filter leaves any model out, whatever its order", () => {
    expect(narrows(NO_FILTER)).toBe(false);
    expect(narrows({ ...NO_FILTER, sort: "input" })).toBe(false);
    expect(narrows({ ...NO_FILTER, mine: true })).toBe(true);
  });
});

describe("keeps and shownModels", () => {
  it("show every model by name when nothing narrows them", () => {
    expect(shown({})).toEqual([LARGE_MODEL, SMALL_MODEL, BEDROCK_MODEL].map((m) => m.identifier));
  });

  it("keep the models whose name or identifier has every word typed, in any case", () => {
    expect(shown({ text: "ACME free" })).toEqual([SMALL_MODEL.identifier]);
    expect(shown({ text: "zeta" })).toEqual([BEDROCK_MODEL.identifier]);
    expect(shown({ text: "  " })).toHaveLength(3);
  });

  it("keep one provider's models", () => {
    expect(shown({ provider: "bedrock" })).toEqual([BEDROCK_MODEL.identifier]);
  });

  it("keep the models that read and can do all that is asked", () => {
    expect(shown({ reads: ["text", "image"] })).toEqual([LARGE_MODEL.identifier]);
    expect(shown({ can: ["streaming"] })).toEqual([SMALL_MODEL.identifier]);
    expect(shown({ can: ["streaming", "vision"] })).toEqual([]);
  });

  it("keep only known contexts and prices within what is asked", () => {
    expect(shown({ context: 32_768 })).toEqual([LARGE_MODEL.identifier, SMALL_MODEL.identifier]);
    expect(shown({ context: 32_769 })).toEqual([LARGE_MODEL.identifier]);
    expect(shown({ inputPrice: 3 })).toEqual([LARGE_MODEL.identifier, SMALL_MODEL.identifier]);
    expect(shown({ inputPrice: 2.99 })).toEqual([SMALL_MODEL.identifier]);
    expect(shown({ outputPrice: 0 })).toEqual([SMALL_MODEL.identifier]);
  });

  it("keep only the local portfolio's models when asked", () => {
    expect(shown({ mine: true })).toEqual([LARGE_MODEL.identifier]);
    expect(keeps({ ...NO_FILTER, mine: true }, SMALL_MODEL)).toBe(false);
  });

  it("order by price lowest first and by context largest first, unknowns last", () => {
    expect(shown({ sort: "input" })).toEqual([
      SMALL_MODEL.identifier,
      LARGE_MODEL.identifier,
      BEDROCK_MODEL.identifier,
    ]);
    expect(shown({ sort: "output" })).toEqual([
      SMALL_MODEL.identifier,
      LARGE_MODEL.identifier,
      BEDROCK_MODEL.identifier,
    ]);
    expect(shown({ sort: "context" })).toEqual([
      LARGE_MODEL.identifier,
      SMALL_MODEL.identifier,
      BEDROCK_MODEL.identifier,
    ]);
  });

  it("put unknowns last, whatever their names", () => {
    const first = { ...BEDROCK_MODEL, identifier: "bedrock/aaa", display_name: "Aaa" };
    const order = (sort: ModelFilter["sort"]) =>
      shownModels([first, SMALL_MODEL, LARGE_MODEL], { ...NO_FILTER, sort }).map(
        (model) => model.identifier,
      );

    expect(order("input").at(-1)).toBe(first.identifier);
    expect(order("context").at(-1)).toBe(first.identifier);
  });

  it("order ties by name", () => {
    const twin = {
      ...SMALL_MODEL,
      identifier: "openrouter/acme/aardvark",
      display_name: "Aardvark",
    };

    expect(
      shownModels([SMALL_MODEL, twin], { ...NO_FILTER, sort: "input" }).map((m) => m.identifier),
    ).toEqual([twin.identifier, SMALL_MODEL.identifier]);
  });

  it("leave the models it was given as they were", () => {
    const models = [...MODELS];

    shownModels(models, NO_FILTER);

    expect(models).toEqual(MODELS);
  });
});

describe("providersOf", () => {
  it("names each provider once, by name", () => {
    expect(providersOf([SMALL_MODEL, BEDROCK_MODEL, LARGE_MODEL])).toEqual([
      "bedrock",
      "openrouter",
    ]);
  });
});

describe("nameOf", () => {
  it("names a model by its name, or its provider's name for it", () => {
    expect(nameOf(LARGE_MODEL)).toBe("Acme Large");
    expect(nameOf(BEDROCK_MODEL)).toBe("zeta.mini-v1");
  });
});

describe("formatTokens", () => {
  it("says counts of tokens as people say them", () => {
    expect(formatTokens(8192)).toBe("8,192");
    expect(formatTokens(32_768)).toBe("33K");
    expect(formatTokens(200_000)).toBe("200K");
    expect(formatTokens(1_000_000)).toBe("1M");
    expect(formatTokens(1_048_576)).toBe("1.05M");
    expect(formatTokens(null)).toBe("unknown");
  });
});

describe("formatPrice", () => {
  it("says what a million tokens cost in dollars, to a hundredth of a cent at most", () => {
    expect(formatPrice(3)).toBe("$3.00");
    expect(formatPrice(0.075)).toBe("$0.075");
    expect(formatPrice(0.00012)).toBe("$0.0001");
    expect(formatPrice(0)).toBe("free");
    expect(formatPrice(null)).toBe("unknown");
  });
});

describe("labelOf", () => {
  it("says what Azathoth names a modality or capability as the editor does", () => {
    expect(labelOf("image")).toBe("Images");
    expect(labelOf("tool_use")).toBe("Tool use");
    expect(labelOf("embeddings")).toBe("embeddings");
    expect(labelOf("function_calling")).toBe("function calling");
  });
});

describe("modelPath", () => {
  it("keeps an identifier's slashes and encodes each part", () => {
    expect(modelPath("openrouter/acme/small:free")).toBe("/models/openrouter/acme/small%3Afree");
  });
});
