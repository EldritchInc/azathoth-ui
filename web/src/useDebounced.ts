import { useEffect, useState } from "react";

/** Returns a value once it has stayed the same for `delay` milliseconds, and at first at once. */
export function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSettled(value);
    }, delay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [value, delay]);

  return settled;
}
