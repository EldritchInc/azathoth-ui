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
  useReactFlow,
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
  type KeyboardEvent,
  type ReactNode,
} from "react";

import type { StepView } from "../documents";
import {
  canvasHeight,
  edgePath,
  flowEdges,
  flowNodes,
  openingNodes,
  viewportOn,
  type EndFlowNode,
  type FlowEdge,
  type StepFlowNode,
} from "../flow";
import type { EdgeKind, WorkflowGraph } from "../graph";
import { highlight, neighbour, nodeOfStep, stepOfNode, type Direction } from "../paths";
import { StepInspector } from "./StepInspector";
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
            data-dimmed={data?.dimmed === true ? "true" : undefined}
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

const ARROWS: Readonly<Record<string, Direction>> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

/** The narrowest canvas that keeps the step's details beside the graph rather than below it. */
const BESIDE_WIDTH = 720;

/** How much of a canvas the details beside it cover, from its right edge. */
const BESIDE_COVERS = 344;

/** A point the canvas moves to, and how many moves came before, so a second move to it moves. */
interface Target {
  readonly x: number;
  readonly y: number;
  readonly turn: number;
}

/** Keeps the canvas on the chosen step when the keyboard or a link chose it. */
function Follow({ target, offset }: { readonly target: Target | null; readonly offset: number }) {
  const flow = useReactFlow();

  useEffect(() => {
    if (target !== null) {
      const zoom = flow.getZoom();

      void flow.setCenter(target.x + offset / zoom, target.y, { zoom, duration: 240 });
    }
  }, [target, offset, flow]);

  return null;
}

function nodeElement(canvas: HTMLElement | null, id: string): HTMLElement | null {
  const nodes = canvas?.querySelectorAll<HTMLElement>(".react-flow__node") ?? [];

  return Array.from(nodes).find((element) => element.dataset.id === id) ?? null;
}

/**
 * A workflow's steps as a graph: its input on the left, a column for each
 * layer, its result on the right, and an arrow for every value, condition
 * and dependency between them. It pans and zooms, with a map of the whole.
 *
 * Choosing a step, by clicking it or with the keyboard, lights the paths
 * that lead to it and from it and shows its details. The arrow keys move
 * between steps, Enter chooses the step in focus, and Escape lets it go.
 */
export function StepsGraph({
  graph,
  selected = null,
  onSelect,
}: {
  readonly graph: WorkflowGraph;
  readonly selected?: string | null;
  readonly onSelect?: (step: string | null) => void;
}) {
  const prefix = `azathoth-arrow-${useId().replace(/[^\w-]/g, "")}`;
  const drawnNodes = useMemo(() => flowNodes(graph), [graph]);
  const drawnEdges = useMemo(() => flowEdges(graph), [graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState(drawnNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(drawnEdges);
  const canvas = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const chosen = nodeOfStep(graph, selected);
  const [openedOn] = useState(chosen);
  const lit = useMemo(() => (chosen === null ? null : highlight(graph, chosen)), [graph, chosen]);
  const beside = width !== null && width >= BESIDE_WIDTH;
  const opening = useMemo(() => (width === null ? [] : openingNodes(graph, width)), [graph, width]);
  const openedAt = useMemo(() => {
    const node = graph.nodes.find((each) => each.id === openedOn);

    return width === null || node === undefined
      ? undefined
      : viewportOn(
          node,
          { width, height: canvasHeight(graph) },
          width >= BESIDE_WIDTH ? BESIDE_COVERS : 0,
        );
  }, [graph, width, openedOn]);
  const shownNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        selected: node.id === chosen,
        className: lit === null || lit.nodes.has(node.id) ? undefined : styles.dimmed,
      })),
    [nodes, chosen, lit],
  );
  const shownEdges = useMemo(
    () =>
      edges.map((edge) => {
        const dimmed = lit !== null && !lit.edges.has(edge.id);

        return {
          ...edge,
          selected: lit?.edges.has(edge.id) ?? false,
          className: dimmed ? styles.dimmed : undefined,
          data: edge.data === undefined ? undefined : { ...edge.data, dimmed },
        };
      }),
    [edges, lit],
  );

  useLayoutEffect(() => {
    setWidth(canvas.current?.clientWidth ?? 0);
  }, []);

  useEffect(() => {
    setNodes(drawnNodes);
    setEdges(drawnEdges);
  }, [drawnNodes, drawnEdges, setNodes, setEdges]);

  const choose = (id: string | null, follow: boolean): void => {
    const step = id === null ? null : stepOfNode(id);

    if (id !== null && step === null) {
      return;
    }
    onSelect?.(step);

    const node = graph.nodes.find((each) => each.id === id);

    if (follow && node !== undefined) {
      setTarget((last) => ({ x: node.x, y: node.y, turn: (last?.turn ?? 0) + 1 }));
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const focused =
      event.target instanceof HTMLElement
        ? (event.target.closest<HTMLElement>(".react-flow__node")?.dataset.id ?? null)
        : null;

    if (event.key === "Escape") {
      if (chosen !== null) {
        event.preventDefault();
        choose(null, false);
      }
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      if (focused !== null && stepOfNode(focused) !== null) {
        event.preventDefault();
        choose(focused, false);
      }
      return;
    }

    const direction = ARROWS[event.key];
    const from = chosen ?? focused;

    if (direction === undefined) {
      return;
    }

    const to =
      from === null
        ? (graph.nodes.find((node) => node.step !== null)?.id ?? null)
        : neighbour(graph, from, direction);

    if (to !== null && stepOfNode(to) !== null) {
      event.preventDefault();
      choose(to, true);
      nodeElement(canvas.current, to)?.focus({ preventScroll: true });
    }
  };

  const inspector =
    chosen === null ? null : (
      <StepInspector
        graph={graph}
        id={chosen}
        onSelect={(id) => {
          choose(id, true);
        }}
        onClose={() => {
          choose(null, false);
        }}
      />
    );

  return (
    <figure className={styles.figure}>
      <div
        ref={canvas}
        className={styles.canvas}
        style={{ height: canvasHeight(graph) }}
        onKeyDown={onKeyDown}
      >
        <Arrowheads prefix={prefix} />
        <Markers value={prefix}>
          {width !== null && (
            <ReactFlow
              className={styles.flow}
              aria-label="The workflow's steps as a graph"
              nodes={shownNodes}
              edges={shownEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={(_, node) => {
                choose(node.id, false);
              }}
              onPaneClick={() => {
                choose(null, false);
              }}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              zoomOnScroll={false}
              panOnScroll={false}
              preventScrolling={false}
              minZoom={0.2}
              maxZoom={1.75}
              fitView={openedAt === undefined}
              fitViewOptions={{ padding: 0.1, maxZoom: 1, nodes: opening }}
              defaultViewport={openedAt}
              attributionPosition="top-right"
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1.3} />
              <Controls showInteractive={false} position="bottom-left" />
              {!(beside && chosen !== null) && (
                <MiniMap
                  position="bottom-right"
                  pannable
                  zoomable
                  nodeClassName={minimapClass}
                  nodeBorderRadius={6}
                  style={{ width: 168, height: 104 }}
                  ariaLabel="A map of the whole graph"
                />
              )}
              <Follow target={target} offset={beside && chosen !== null ? BESIDE_COVERS / 2 : 0} />
            </ReactFlow>
          )}
        </Markers>
        {beside && inspector !== null && <div className={styles.beside}>{inspector}</div>}
      </div>
      {!beside && inspector}
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
        <span className={styles.hint}>
          Choose a step for its details and paths; the arrow keys move between steps.
        </span>
      </figcaption>
    </figure>
  );
}
