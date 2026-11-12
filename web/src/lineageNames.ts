/**
 * What this instance calls each workflow, tool version and benchmark a
 * remote's status or a report names, read from the lists it already keeps.
 */

import type { Lineage } from "./api/types";
import { useList } from "./queries";

/**
 * Returns a function naming a lineage by its component's name here, or
 * `null` when this instance does not list it.
 */
export function useLineageNames(): (lineage: Lineage) => string | null {
  const workflows = useList("workflows");
  const tools = useList("tools");
  const benchmarks = useList("benchmarks");

  return (lineage) => {
    const found =
      lineage.kind === "workflow"
        ? workflows.data?.find((each) => each.id === lineage.id)
        : lineage.kind === "benchmark"
          ? benchmarks.data?.find((each) => each.id === lineage.id)
          : tools.data?.find((each) => each.id === lineage.id && each.version === lineage.version);

    return found === undefined ? null : found.name;
  };
}
