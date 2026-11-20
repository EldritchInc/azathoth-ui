import { useState } from "react";
import { useParams } from "react-router";

import { isBenchmarkSummary } from "../api/types";
import { readDraft } from "../drafts";
import { browserStorage } from "../theme";
import buttons from "./Buttons.module.css";

import { BenchmarkCases } from "./BenchmarkCases";
import { BenchmarkTabs, type BenchmarkTab } from "./BenchmarkTabs";
import { CaseList } from "./CaseList";
import { ExecutionList } from "./ExecutionList";
import { ExperimentList } from "./ExperimentList";
import { DetailPage } from "./DetailPage";
import { InstanceLink } from "./InstanceLink";
import { ProductionTab } from "./ProductionTab";
import { InterruptedRuns } from "./InterruptedRuns";
import { RunHistory } from "./RunHistory";
import { WorkflowSpend } from "./SpendTabs";
import { ToolStructure } from "./ToolStructure";
import { ToolVersions } from "./ToolVersions";
import { WorkflowSteps } from "./WorkflowSteps";
import { WorkflowTabs, type WorkflowTab } from "./WorkflowTabs";

/**
 * `/workflows/:id`: one workflow's page, with a way to edit it, or go on
 * editing it, and its tabs (ADR 0010): its revisions here, its runs at
 * `/runs`, interrupted ones first (ADR 0012), its production at
 * `/production`, its experiments at `/experiments` (ADR 0013), and its
 * spend at `/spend` (ADR 0014). Beside
 * Run, Optimize opens `/optimize`.
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
            : tab === "experiments"
              ? () => <ExperimentList workflowId={id} />
              : tab === "spend"
                ? () => <WorkflowSpend workflowId={id} />
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
          <InstanceLink className={buttons.quiet} to={`/workflows/${id}/optimize`}>
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
              <path d="M4 17 9.5 11.5l3.5 3.5L20 8" />
              <path d="M15 8h5v5" />
            </svg>
            Optimize
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

/**
 * `/tools/:id/versions/:version`: one tool version's page, naming every
 * version of the tool, each opening its own (ADR 0015).
 */
export function ToolPage() {
  const { id = "", version = "" } = useParams();

  return (
    <DetailPage kind="tools" component={{ id, version }} tabs={<ToolVersions toolId={id} />}>
      {(detail) => <ToolStructure document={detail.document} />}
    </DetailPage>
  );
}

/**
 * `/benchmarks/:id`: one benchmark's page, with its tabs (ADR 0012): its
 * cases here, its document, with its revisions, at `/document`, and its
 * executions at `/executions`.
 */
export function BenchmarkPage({ tab = "cases" }: { readonly tab?: BenchmarkTab }) {
  const { id = "" } = useParams();

  return (
    <DetailPage
      kind="benchmarks"
      component={{ id }}
      tabs={<BenchmarkTabs benchmarkId={id} />}
      section={
        tab === "cases"
          ? (detail) => <CaseList detail={detail} />
          : tab === "executions"
            ? () => <ExecutionList benchmarkId={id} />
            : undefined
      }
      actions={
        <>
          <InstanceLink className={buttons.primary} to={`/benchmarks/${id}/run`}>
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
          <InstanceLink className={buttons.quiet} to={`/benchmarks/${id}/compare`}>
            Compare
          </InstanceLink>
        </>
      }
    >
      {(detail) => (
        <BenchmarkCases
          document={detail.document}
          sensitivity={isBenchmarkSummary(detail) ? detail.sensitivity : null}
        />
      )}
    </DetailPage>
  );
}
