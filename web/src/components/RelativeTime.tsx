import { fullTime, relativeTime } from "../time";

/** When something happened, as people say it, with the exact moment on hover. */
export function RelativeTime({ iso }: { readonly iso: string | null }) {
  if (iso === null) {
    return <span>Unknown</span>;
  }
  const moment = new Date(iso);

  return (
    <time dateTime={iso} title={fullTime(moment)}>
      {relativeTime(moment, new Date())}
    </time>
  );
}
