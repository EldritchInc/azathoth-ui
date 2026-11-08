/** Joins the class names given, leaving out any that are missing or turned off. */
export function classNames(...names: (string | false | null | undefined)[]): string {
  return names.filter((name): name is string => typeof name === "string" && name !== "").join(" ");
}
