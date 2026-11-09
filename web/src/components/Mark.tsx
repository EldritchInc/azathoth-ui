import { LOGO_PATH, LOGO_TRANSFORM, LOGO_VIEW_BOX } from "../logo";

/** The Eldritch, Inc. logo, in the colour of the text around it. */
export function Mark({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox={LOGO_VIEW_BOX} aria-hidden="true" focusable="false">
      <path transform={LOGO_TRANSFORM} fill="currentColor" d={LOGO_PATH} />
    </svg>
  );
}
