import "@xyflow/react/dist/style.css";

import {
  Background,
  BackgroundVariant,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type EdgeProps,
  type EdgeTypes,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import {
  createContext,
  use,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { StepView } from "../documents";
import {
  canvasHeight,
  edgePath,
  flowEdges,
  flowNodes,
  openingNodes,
  type EndFlowNode,
  type FlowEdge,
  type StepFlowNode,
} from "../flow";
import type { EdgeKind, WorkflowGraph } from "../graph";
import styles from "./StepsGraph.module.css";

const EDGE_KINDS: readonly EdgeKind[] = ["data", "condition", "order"];

const MAXIMUM_TAGS = 3;

const ICONS: Record<StepView["kind"], ReactNode> = {
  prompt: <path d="M4 5.5h16v10H9l-5 4v-14Z" />,
  tool: <path d="M14.5 5.5a4 4 0 0 0-5 5L4 16l4 4 5.5-5.5a4 4 0 0 0 5-5L16 12l-4-4 2.5-2.5Z" />,
  unknown: <circle cx="12" cy="12" r="6" />,
};

const KIND_NAMES: Record<StepView["kind"], string> = {
  prompt: "Prompt",
  tool: "Tool",
  unknown: "Step",
};

/** The id prefix of this graph's arrowheads, so two graphs on a page keep their own. */
const Markers = createContext("azathoth-arrow");

function Icon({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function kindLine(step: StepView): string {
  const extra = step.kind === "tool" ? step.runtime : step.answers;

  return extra === null ? KIND_NAMES[step.kind] : `${KIND_NAMES[step.kind]} · ${extra}`;
}

function StepNode({ data, selected }: NodeProps<StepFlowNode>) {
  const { step, constants, result } = data;
  const tags = [
    ...constants.map((constant) => ({
      key: `constant-${constant.name}`,
      text: `${constant.name} = ${constant.value}`,
      kind: "constant",
    })),
    ...step.outputs.map((name) => ({
      key: `output-${name}`,
      text: name,
      kind: name === result ? "result" : "output",
    })),
  ];
  const shown = tags.slice(0, MAXIMUM_TAGS);
  const hidden = tags.length - shown.length;

  return (
    <div
      className={styles.step}
      data-kind={step.kind}
      data-selected={selected ? "true" : undefined}
    >
      <Handle
        className={styles.handle}
        type="target"
        position={Position.Left}
        isConnectable={false}
      />
      <div className={styles.stepTop}>
        <Icon className={styles.kindIcon}>{ICONS[step.kind]}</Icon>
        <span className={styles.kind}>{kindLine(step)}</span>
        {step.when.length > 0 && (
          <span className={styles.branch} title="Runs only on a condition">
            <Icon>
              <path d="M6 4v8a4 4 0 0 0 4 4h8M14 12l4 4-4 4" />
            </Icon>
            <span className="visually-hidden">Runs only on a condition</span>
          </span>
        )}
      </div>
      <p className={styles.stepTitle} title={step.title}>
        {step.title}
      </p>
      {tags.length > 0 && (
        <ul className={styles.tags}>
          {shown.map((tag) => (
            <li key={tag.key} className={styles.tag} data-kind={tag.kind}>
              {tag.text}
            </li>
          ))}
          {hidden > 0 && <li className={styles.more}>+{hidden}</li>}
        </ul>
      )}
      <Handle
        className={styles.handle}
        type="source"
        position={Position.Right}
        isConnectable={false}
      />
    </div>
  );
}

function EndNode({ data, type, selected }: NodeProps<EndFlowNode>) {
  const start = type === "start";

  return (
    <div className={styles.end} data-end={type} data-selected={selected ? "true" : undefined}>
      {!start && (
        <Handle
          className={styles.handle}
          type="target"
          position={Position.Left}
          isConnectable={false}
        />
      )}
      <span className={styles.endName}>{start ? "Input" : "Result"}</span>
      {!start && <code className={styles.endValue}>{data.label}</code>}
      {start && (
        <Handle
          className={styles.handle}
          type="source"
          position={Position.Right}
          isConnectable={false}
        />
      )}
    </div>
  );
}

function WorkflowEdge({ data, selected, sourceX, sourceY, targetX, targetY }: EdgeProps<FlowEdge>) {
  const markers = use(Markers);
  const [hovered, setHovered] = useState(false);
  const { path, label: at } = useMemo(
    () => edgePath({ x: sourceX, y: sourceY }, data?.points ?? [], { x: targetX, y: targetY }),
    [sourceX, sourceY, targetX, targetY, data?.points],
  );
  const kind = data?.kind ?? "data";
  const label = data?.label ?? "";
  const active = hovered || selected === true;

  return (
    <>
      <path
        className={styles.edge}
        d={path}
        data-kind={kind}
        data-active={active ? "true" : undefined}
        markerEnd={`url(#${markers}-${kind})`}
      />
      <path
        className={styles.edgeTarget}
        d={path}
        onMouseEnter={() => {
          setHovered(true);
        }}
        onMouseLeave={() => {
          setHovered(false);
        }}
      />
      {label !== "" && (kind === "condition" || active) && (
        <EdgeLabelRenderer>
          <div
            className={styles.edgeLabel}
            data-kind={kind}
            style={{
              transform: `translate(-50%, -50%) translate(${String(at.x)}px, ${String(at.y)}px)`,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const NODE_TYPES = { step: StepNode, start: EndNode, result: EndNode } satisfies NodeTypes;

const EDGE_TYPES = { workflow: WorkflowEdge } satisfies EdgeTypes;

function minimapClass(node: Node): string {
  return (node.type === "step" ? styles.miniStep : styles.miniEnd) ?? "";
}

function Arrowheads({ prefix }: { readonly prefix: string }) {
  return (
    <svg className={styles.markers} aria-hidden="true" focusable="false">
      <defs>
        {EDGE_KINDS.map((kind) => (
          <marker
            key={kind}
            id={`${prefix}-${kind}`}
            viewBox="0 0 10 10"
            refX="8.5"
            refY="5"
            markerWidth="9"
            markerHeight="9"
            markerUnits="userSpaceOnUse"
            orient="auto-start-reverse"
          >
            <path className={styles.arrow} data-kind={kind} d="M1 1.5 8.5 5 1 8.5Z" />
          </marker>
        ))}
      </defs>
    </svg>
  );
}

function LegendLine({ kind }: { readonly kind: EdgeKind }) {
  return (
    <svg className={styles.legendLine} viewBox="0 0 28 8" aria-hidden="true" focusable="false">
      <path className={styles.edge} data-kind={kind} d="M1 4h26" />
    </svg>
  );
}

/**
 * A workflow's steps as a graph: its input on the left, a column for each
 * layer, its result on the right, and an arrow for every value, condition
 * and dependency between them. It pans and zooms, with a map of the whole.
 */
export function StepsGraph({ graph }: { readonly graph: WorkflowGraph }) {
  const prefix = `azathoth-arrow-${useId().replace(/[^\w-]/g, "")}`;
  const drawnNodes = useMemo(() => flowNodes(graph), [graph]);
  const drawnEdges = useMemo(() => flowEdges(graph), [graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState(drawnNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(drawnEdges);
  const canvas = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const opening = useMemo(() => (width === null ? [] : openingNodes(graph, width)), [graph, width]);

  useLayoutEffect(() => {
    setWidth(canvas.current?.clientWidth ?? 0);
  }, []);

  useEffect(() => {
    setNodes(drawnNodes);
    setEdges(drawnEdges);
  }, [drawnNodes, drawnEdges, setNodes, setEdges]);

  return (
    <figure className={styles.figure}>
      <div ref={canvas} className={styles.canvas} style={{ height: canvasHeight(graph) }}>
        <Arrowheads prefix={prefix} />
        <Markers value={prefix}>
          {width !== null && (
            <ReactFlow
              className={styles.flow}
              aria-label="The workflow's steps as a graph"
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              nodesDraggable={false}
              nodesConnectable={false}
              zoomOnScroll={false}
              panOnScroll={false}
              preventScrolling={false}
              minZoom={0.2}
              maxZoom={1.75}
              fitView
              fitViewOptions={{ padding: 0.1, maxZoom: 1, nodes: opening }}
              attributionPosition="top-right"
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1.3} />
              <Controls showInteractive={false} position="bottom-left" />
              <MiniMap
                position="bottom-right"
                pannable
                zoomable
                nodeClassName={minimapClass}
                nodeBorderRadius={6}
                style={{ width: 168, height: 104 }}
                ariaLabel="A map of the whole graph"
              />
            </ReactFlow>
          )}
        </Markers>
      </div>
      <figcaption className={styles.legend}>
        <span className={styles.legendItem}>
          <LegendLine kind="data" />
          passes a value
        </span>
        <span className={styles.legendItem}>
          <LegendLine kind="condition" />
          decides whether it runs
        </span>
        <span className={styles.legendItem}>
          <LegendLine kind="order" />
          runs after
        </span>
        <span className={styles.hint}>Drag to pan, pinch or use the buttons to zoom.</span>
      </figcaption>
    </figure>
  );
}
