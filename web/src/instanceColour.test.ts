import { describe, expect, it } from "vitest";

import { colourOf, hueOf, instanceStyle } from "./instanceColour";
import { LOCAL_SCOPE } from "./scope";

describe("hueOf", () => {
  it("draws the same hue from the same name, wherever it is drawn", () => {
    expect(hueOf("staging")).toBe(hueOf("staging"));
    expect(hueOf("origin")).toBe(hueOf("origin"));
  });

  it("draws a whole hue from the colour wheel", () => {
    for (const name of ["origin", "staging", "prod", "team-a", "x"]) {
      const hue = hueOf(name);

      expect(Number.isInteger(hue)).toBe(true);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it("tells common remote names apart", () => {
    const hues = new Set(["origin", "staging", "prod", "production", "dev"].map(hueOf));

    expect(hues.size).toBe(5);
  });
});

describe("colourOf", () => {
  it("gives the local instance a colour no remote is given", () => {
    expect(colourOf(LOCAL_SCOPE.name)).toBe("var(--instance-local)");
    expect(colourOf("staging")).not.toBe(colourOf(LOCAL_SCOPE.name));
  });

  it("gives a remote its name's hue, at the theme's lightness", () => {
    expect(colourOf("staging")).toBe(
      `oklch(var(--instance-lightness) var(--instance-chroma) ${String(hueOf("staging"))})`,
    );
  });
});

describe("instanceStyle", () => {
  it("sets an instance's colour as --instance", () => {
    expect(instanceStyle("staging")).toEqual({ "--instance": colourOf("staging") });
  });
});
