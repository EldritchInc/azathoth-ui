import { useState } from "react";
import { Link, useParams } from "react-router";

import { readDraft } from "../drafts";
import { browserStorage } from "../theme";
import buttons from "./Buttons.module.css";

import { BenchmarkCases } from "./BenchmarkCases";
import { DetailPage } from "./DetailPage";
import { ToolStructure } from "./ToolStructure";
import { WorkflowSteps } from "./WorkflowSteps";

/** `/workflows/:id`: one workflow's page, with a way to edit it, or go on editing it. */
export function WorkflowPage() {
  const { id = "" } = useParams();
  const [drafted] = useState(() => readDraft(browserStorage(), id) !== null);

  return (
    <DetailPage
      kind="workflows"
      component={{ id }}
      actions={
        <>
          <Link className={buttons.primary} to={`/workflows/${id}/edit`}>
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
          </Link>
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
      {(detail) => <BenchmarkCases document={detail.document} />}
    </DetailPage>
  );
}
