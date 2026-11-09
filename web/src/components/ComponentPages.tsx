import { useParams } from "react-router";

import { BenchmarkCases } from "./BenchmarkCases";
import { DetailPage } from "./DetailPage";
import { ToolStructure } from "./ToolStructure";
import { WorkflowSteps } from "./WorkflowSteps";

/** `/workflows/:id`: one workflow's page. */
export function WorkflowPage() {
  const { id = "" } = useParams();

  return (
    <DetailPage kind="workflows" component={{ id }}>
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
