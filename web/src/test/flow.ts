/**
 * What React Flow needs from a browser that jsdom lacks: an observer that
 * reports each element's size at once, the zoom of a transform, element
 * sizes, and SVG bounding boxes. Each stands in only where jsdom has none.
 */

class SizeObserver implements ResizeObserver {
  readonly #report: ResizeObserverCallback;

  constructor(report: ResizeObserverCallback) {
    this.#report = report;
  }

  observe(target: Element): void {
    this.#report(
      [
        {
          target,
          contentRect: target.getBoundingClientRect(),
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        },
      ],
      this,
    );
  }

  unobserve(): void {
    // Nothing is watched.
  }

  disconnect(): void {
    // Nothing is watched.
  }
}

class TransformMatrix {
  readonly m22: number;

  constructor(transform?: string) {
    const scale = /scale\(([\d.]+)\)/.exec(transform ?? "")?.[1];

    this.m22 = scale === undefined ? 1 : Number(scale);
  }
}

function size(value: string): number {
  return Number.parseFloat(value) || 1;
}

/** Gives jsdom what React Flow measures with. */
export function standInForReactFlow(): void {
  if (!("ResizeObserver" in globalThis)) {
    Object.defineProperty(globalThis, "ResizeObserver", {
      value: SizeObserver,
      configurable: true,
      writable: true,
    });
  }
  if (!("DOMMatrixReadOnly" in globalThis)) {
    Object.defineProperty(globalThis, "DOMMatrixReadOnly", {
      value: TransformMatrix,
      configurable: true,
      writable: true,
    });
  }
  Object.defineProperties(HTMLElement.prototype, {
    offsetHeight: {
      configurable: true,
      get(this: HTMLElement) {
        return size(this.style.height);
      },
    },
    offsetWidth: {
      configurable: true,
      get(this: HTMLElement) {
        return size(this.style.width);
      },
    },
  });
  if (!("getBBox" in SVGElement.prototype)) {
    Object.defineProperty(SVGElement.prototype, "getBBox", {
      configurable: true,
      value: () => ({ x: 0, y: 0, width: 0, height: 0 }),
    });
  }
}
