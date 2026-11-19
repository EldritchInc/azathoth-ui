import { useState } from "react";
import { useParams } from "react-router";

import { isBenchmarkSummary } from "../api/types";
import { readDraft } from "../drafts";
import { browserStorage } from "../theme";
import buttons from "./Buttons.module.css";

import { BenchmarkCases } from "./BenchmarkCases";
import { DetailPage } from "./DetailPage";
import { InstanceLink } from "./InstanceLink";
import { ProductionTab } from "./ProductionTab";
import { InterruptedRuns } from "./InterruptedRuns";
import { RunHistory } from "./RunHistory";
import { ToolStructure } from "./ToolStructure";
import { WorkflowSteps } from "./WorkflowSteps";
import { WorkflowTabs, type WorkflowTab } from "./WorkflowTabs";

/**
 * `/workflows/:id`: one workflow's page, with a way to edit it, or go on
 * editing it, and its tabs (ADR 0010): its revisions here, its runs at
 * `/runs`, interrupted ones first (ADR 0012), and its production at
 * `/production`.
 */
export function WorkflowPage({ tab = "revisions" }: { readonly tab?: WorkflowTab }) {
  const { id = "" } = useParams();
  const [drafted] = useState(() => readDraft(browserStorage(), id) !== null);

  return (
    <DetailPage
      kind="workflows"
      component={{ id }}
      tabs={<WorkflowTabs workflowId={id} />}
      section={
        tab === "runs"
          ? () => (
              <>
                <InterruptedRuns workflowId={id} />
                <RunHistory workflowId={id} />
              </>
            )
          : tab === "production"
            ? (detail) => (
                <ProductionTab workflowId={id} name={detail.name} latest={detail.latest_number} />
              )
            : undefined
      }
      actions={
        <>
          <InstanceLink className={buttons.primary} to={`/workflows/${id}/run`}>
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
              fill="currentColor"
              stroke="none"
            >
              <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
            </svg>
            Run
          </InstanceLink>
          <InstanceLink className={buttons.quiet} to={`/workflows/${id}/edit`}>
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
              <path d="m13.5 6.5 4 4" />
            </svg>
            {drafted ? "Continue editing" : "Edit"}
          </InstanceLink>
          {drafted && <span className={buttons.note}>Your unsaved edits are kept.</span>}
        </>
      }
    >
      {(detail) => <WorkflowSteps document={detail.document} />}
    </DetailPage>
  );
}

/** `/tools/:id/versions/:version`: one tool version's page. */
export function ToolPage() {
  const { id = "", version = "" } = useParams();

  return (
    <DetailPage kind="tools" component={{ id, version }}>
      {(detail) => <ToolStructure document={detail.document} />}
    </DetailPage>
  );
}

/** `/benchmarks/:id`: one benchmark's page. */
export function BenchmarkPage() {
  const { id = "" } = useParams();

  return (
    <DetailPage kind="benchmarks" component={{ id }}>
      {(detail) => (
        <BenchmarkCases
          document={detail.document}
          sensitivity={isBenchmarkSummary(detail) ? detail.sensitivity : null}
        />
      )}
    </DetailPage>
  );
}
