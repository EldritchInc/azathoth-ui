import { useId } from "react";

import type { RunDetail } from "../api/types";
import { citationOf, collectionLabel, isWebLink, type Citation } from "../citations";
import { useRunAnnotations } from "../queries";
import { Command } from "./Command";
import { Restricted } from "./Restricted";
import styles from "./RunEvidence.module.css";

function Source({ source }: { readonly source: string }) {
  return isWebLink(source) ? (
    <a className={styles.source} href={source} target="_blank" rel="noreferrer noopener">
      {source}
    </a>
  ) : (
    <code className={styles.source}>{source}</code>
  );
}

function CitationItem({ citation }: { readonly citation: Citation }) {
  return (
    <li className={styles.item}>
      {citation.quote !== null && (
        <blockquote className={styles.quote}>{citation.quote}</blockquote>
      )}
      {citation.source !== null && (
        <p className={styles.line}>
          <span className={styles.muted}>Found in</span> <Source source={citation.source} />
        </p>
      )}
      {citation.description !== null && <p className={styles.muted}>{citation.description}</p>}
    </li>
  );
}

/**
 * A run's verified citations: what each quotes and where it was found, and
 * how many checks did not verify and were left out, with the command that
 * exports them as Web Annotations. A restricted run's are hidden with the
 * rest of its data, since a quote repeats its sources (ADR 0012).
 */
export function RunCitations({ run }: { readonly run: RunDetail }) {
  const annotations = useRunAnnotations(run.run_id);
  const heading = useId();
  const label = annotations.data === undefined ? null : collectionLabel(annotations.data);
  const citations = (annotations.data?.items ?? []).map(citationOf);

  return (
    <section className={styles.section} aria-labelledby={heading}>
      <h2 id={heading} className={styles.title}>
        Citations
      </h2>
      {annotations.isPending && (
        <p className={styles.muted} role="status">
          Loading its citations…
        </p>
      )}
      {annotations.isError && (
        <p className={styles.muted}>Couldn’t load its citations: {annotations.error.message}</p>
      )}
      {annotations.data !== undefined && (
        <>
          {label !== null && <p className={styles.muted}>{label}</p>}
          {citations.length === 0 ? (
            <p className={styles.muted}>No step of this run kept a verified citation.</p>
          ) : (
            <Restricted sensitivity={run.sensitivity} what="its citations" subject={run.run_id}>
              <ol className={styles.list} aria-label="Citations">
                {citations.map((citation, index) => (
                  <CitationItem key={citation.id ?? String(index)} citation={citation} />
                ))}
              </ol>
            </Restricted>
          )}
          <Command command={annotations.data.command} />
        </>
      )}
    </section>
  );
}
