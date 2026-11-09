import "@xyflow/react/dist/style.css";

import {
  Background,
  BackgroundVariant,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStore,
  type EdgeProps,
  type Connection,
  type EdgeTypes,
  type Node,
  type NodeProps,
  type NodeTypes,
  type ReactFlowState,
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

import { layers, type StepView, type WorkflowView } from "../documents";
import { addInput, addStep, removeStep, setResult, type StepKind } from "../editing";
import {
  canvasHeight,
  detailAt,
  edgePath,
  flowEdges,
  flowNodes,
  openingNodes,
  viewportOn,
  type Detail,
  type EndFlowNode,
  type FlowEdge,
  type FoldFlowNode,
  type StepFlowNode,
} from "../flow";
import {
  buildGraph,
  layerOfFold,
  stepNode,
  wideLayers,
  type EdgeKind,
  type WorkflowGraph,
} from "../graph";
import { highlight, neighbour, nodeOfStep, stepOfNode, type Direction } from "../paths";
import { ComposerBar } from "./ComposerBar";
import { ComposingContext, joining, unjoining, type Offer } from "./composing";
import { StepInspector } from "./StepInspector";
import styles from "./StepsGraph.module.css";

const EDGE_KINDS: readonly EdgeKind[] = ["data", "condition", "order"];

const MAXIMUM_TAGS = 3;

/** How many names of a folded layer's steps its node lists. */
const FOLD_TITLES = 3;

/** The most nodes a graph has before the canvas draws only those in view. */
const VISIBLE_ONLY_AFTER = 150;

const NO_GRAPH: WorkflowGraph = { nodes: [], edges: [], columns: 0 };

function detailOf(state: ReactFlowState): Detail {
  return detailAt(state.transform[2]);
}

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
  const detail = useStore(detailOf);
  const composing = use(ComposingContext);
  const editing = composing !== null;
  const problems = composing?.problems.get(step.id) ?? [];
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
      data-detail={detail}
      data-selected={selected ? "true" : undefined}
    >
      <Handle
        className={styles.handle}
        type="target"
        position={Position.Left}
        isConnectable={editing}
      />
      {problems.length > 0 && (
        <span className={styles.problems} title={problems.join("\n")}>
          {problems.length}
          <span className="visually-hidden">
            {problems.length === 1 ? " thing to fix" : " things to fix"}
          </span>
        </span>
      )}
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
        isConnectable={editing}
      />
    </div>
  );
}

function EndNode({ data, type, selected }: NodeProps<EndFlowNode>) {
  const start = type === "start";
  const editing = use(ComposingContext) !== null;

  return (
    <div className={styles.end} data-end={type} data-selected={selected ? "true" : undefined}>
      {!start && (
        <Handle
          className={styles.handle}
          type="target"
          position={Position.Left}
          isConnectable={editing}
        />
      )}
      <span className={styles.endName}>{start ? "Input" : "Result"}</span>
      {!start && <code className={styles.endValue}>{data.label}</code>}
      {start && (
        <Handle
          className={styles.handle}
          type="source"
          position={Position.Right}
          isConnectable={editing}
        />
      )}
    </div>
  );
}

function FoldNode({ data }: NodeProps<FoldFlowNode>) {
  const detail = useStore(detailOf);
  const shown = data.titles.slice(0, FOLD_TITLES);
  const hidden = data.titles.length - shown.length;

  return (
    <div className={styles.fold} data-detail={detail}>
      <Handle
        className={styles.handle}
        type="target"
        position={Position.Left}
        isConnectable={false}
      />
      <div className={styles.stepTop}>
        <Icon className={styles.kindIcon}>
          <path d="M4 8h16M4 12h16M4 16h16" />
        </Icon>
        <span className={styles.kind}>Layer {data.layer} · folded</span>
      </div>
      <p className={styles.stepTitle}>{data.titles.length} steps at once</p>
      <p className={styles.foldNames}>
        {shown.join(", ")}
        {hidden > 0 && `, +${String(hidden)}`}
      </p>
      <Handle
        className={styles.handle}
        type="source"
        position={Position.Right}
        isConnectable={false}
      />
    </div>
  );
}

function WorkflowEdge({ data, selected, sourceX, sourceY, targetX, targetY }: EdgeProps<FlowEdge>) {
  const markers = use(Markers);
  const detail = useStore(detailOf);
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
      {label !== "" && detail === "full" && (kind === "condition" || active) && (
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

const NODE_TYPES = {
  step: StepNode,
  fold: FoldNode,
  start: EndNode,
  result: EndNode,
} satisfies NodeTypes;

const EDGE_TYPES = { workflow: WorkflowEdge } satisfies EdgeTypes;

function minimapClass(node: Node): string {
  return (node.type === "step" || node.type === "fold" ? styles.miniStep : styles.miniEnd) ?? "";
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
  view,
  selected = null,
  onSelect,
}: {
  readonly view: WorkflowView;
  readonly selected?: string | null;
  readonly onSelect?: (step: string | null) => void;
}) {
  const composing = use(ComposingContext);
  const editing = composing !== null;
  const layered = useMemo(() => layers(view), [view]);
  const wide = useMemo(() => wideLayers(view), [view]);
  const [chosenEdge, setChosenEdge] = useState<string | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [arriving, setArriving] = useState<string | null>(null);
  const [folded, setFolded] = useState<ReadonlySet<number>>(() => new Set());
  const chosenLayer =
    layered?.findIndex((layer) => layer.some((step) => step.id === selected)) ?? -1;
  const graph = useMemo(
    () =>
      buildGraph(view, {
        folded: new Set([...folded].filter((layer) => layer !== chosenLayer)),
      }) ?? NO_GRAPH,
    [view, folded, chosenLayer],
  );
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
          selected: edge.id === chosenEdge || (lit?.edges.has(edge.id) ?? false),
          className: dimmed ? styles.dimmed : undefined,
          data: edge.data === undefined ? undefined : { ...edge.data, dimmed },
        };
      }),
    [edges, lit, chosenEdge],
  );
  const edge = graph.edges.find((each) => each.id === chosenEdge) ?? null;

  useLayoutEffect(() => {
    setWidth(canvas.current?.clientWidth ?? 0);
  }, []);

  useEffect(() => {
    setNodes(drawnNodes);
    setEdges(drawnEdges);
  }, [drawnNodes, drawnEdges, setNodes, setEdges]);

  useEffect(() => {
    const node = graph.nodes.find((each) => each.id === arriving);

    if (node !== undefined) {
      setTarget((last) => ({ x: node.x, y: node.y, turn: (last?.turn ?? 0) + 1 }));
      setArriving(null);
    }
  }, [graph, arriving]);

  const fold = (layer: number): void => {
    setFolded((last) => {
      const next = new Set(last);

      if (!next.delete(layer)) {
        next.add(layer);
      }
      return next;
    });
  };

  const choose = (id: string | null, follow: boolean): void => {
    const foldedLayer = id === null ? null : layerOfFold(id);

    if (foldedLayer !== null) {
      fold(foldedLayer);
      return;
    }

    const step = id === null ? null : stepOfNode(id);

    if (id !== null && step === null) {
      return;
    }
    setChosenEdge(null);
    onSelect?.(step);

    const node = graph.nodes.find((each) => each.id === id);

    if (follow && node !== undefined) {
      setTarget((last) => ({ x: node.x, y: node.y, turn: (last?.turn ?? 0) + 1 }));
    }
  };

  const chosenStep = chosen === null ? null : stepOfNode(chosen);

  const add = (kind: StepKind): void => {
    if (composing === null) {
      return;
    }

    const id = composing.newId();
    const specification = composing.newId();

    composing.change((document) =>
      addStep(document, kind, { step: id, specification }, chosenStep === null ? [] : [chosenStep]),
    );
    setArriving(stepNode(id));
    onSelect?.(id);
  };

  const removeChosenStep = (): void => {
    if (composing !== null && chosenStep !== null) {
      composing.change((document) => removeStep(document, chosenStep));
      onSelect?.(null);
    }
  };

  const removeChosenEdge = (): void => {
    const edit = edge === null ? null : unjoining(edge);

    if (composing !== null && edit !== null) {
      composing.change(edit);
    }
    setChosenEdge(null);
  };

  const join = ({ source, target }: Connection): void => {
    const joined = composing === null ? null : joining(composing.document, source, target);

    if (composing !== null && joined !== null) {
      if (joined.edit !== null) {
        composing.change(joined.edit);
      }
      setOffer(joined.offer);
    }
  };

  const joinable = ({ source, target }: Connection | FlowEdge): boolean =>
    composing !== null && joining(composing.document, source, target) !== null;

  const pass = (output: string): void => {
    if (composing !== null && offer?.kind === "pass") {
      const from = stepOfNode(offer.from);
      const to = stepOfNode(offer.to);

      if (from !== null && to !== null) {
        composing.change((document) =>
          addInput(document, to, output, { kind: "step", step: from, name: output }),
        );
      }
    }
    setOffer(null);
  };

  const makeResult = (output: string): void => {
    const from = offer === null ? null : stepOfNode(offer.from);

    if (composing !== null && from !== null) {
      composing.change((document) => setResult(document, { step: from, name: output }));
    }
    setOffer(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const focused =
      event.target instanceof HTMLElement
        ? (event.target.closest<HTMLElement>(".react-flow__node")?.dataset.id ?? null)
        : null;

    if (event.key === "Escape") {
      if (offer !== null || chosenEdge !== null) {
        event.preventDefault();
        setOffer(null);
        setChosenEdge(null);
      } else if (chosen !== null) {
        event.preventDefault();
        choose(null, false);
      }
      return;
    }
    if (editing && (event.key === "Delete" || event.key === "Backspace")) {
      if (edge !== null) {
        event.preventDefault();
        removeChosenEdge();
      } else if (chosenStep !== null) {
        event.preventDefault();
        removeChosenStep();
      }
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      if (focused !== null && (stepOfNode(focused) !== null || layerOfFold(focused) !== null)) {
        event.preventDefault();
        choose(focused, false);
      }
      return;
    }

    const direction = ARROWS[event.key];
    const from = focused ?? chosen;

    if (direction === undefined) {
      return;
    }

    const to =
      from === null
        ? (graph.nodes.find((node) => node.step !== null)?.id ?? null)
        : neighbour(graph, from, direction);

    if (to !== null && layerOfFold(to) !== null) {
      event.preventDefault();
      nodeElement(canvas.current, to)?.focus({ preventScroll: true });
    } else if (to !== null && stepOfNode(to) !== null) {
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
                setOffer(null);
              }}
              onEdgeClick={(_, clicked) => {
                if (editing) {
                  setChosenEdge(clicked.id);
                  setOffer(null);
                }
              }}
              onConnect={join}
              isValidConnection={joinable}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              nodesDraggable={false}
              nodesConnectable={editing}
              elementsSelectable={false}
              zoomOnScroll={false}
              panOnScroll={false}
              preventScrolling={false}
              minZoom={0.2}
              maxZoom={1.75}
              onlyRenderVisibleElements={graph.nodes.length > VISIBLE_ONLY_AFTER}
              fitView={openedAt === undefined}
              fitViewOptions={{ padding: 0.1, maxZoom: 1, nodes: opening }}
              defaultViewport={openedAt}
              attributionPosition="top-right"
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1.3} />
              <Controls showInteractive={false} position="bottom-left" />
              {editing && (
                <Panel
                  position="top-left"
                  style={{
                    maxWidth:
                      beside && chosen !== null
                        ? Math.max(0, width - BESIDE_COVERS - 32)
                        : undefined,
                  }}
                >
                  <ComposerBar
                    graph={graph}
                    chosen={chosen}
                    edge={edge}
                    offer={offer}
                    onAdd={add}
                    onRemoveStep={removeChosenStep}
                    onRemoveEdge={removeChosenEdge}
                    onPass={pass}
                    onResult={makeResult}
                    onDismiss={() => {
                      setOffer(null);
                    }}
                  />
                </Panel>
              )}
              {wide.length > 0 && (
                <Panel position={editing ? "bottom-center" : "top-left"} className={styles.folds}>
                  <span className={styles.foldsTitle}>Wide layers</span>
                  {wide.map((layer) => {
                    const isFolded = folded.has(layer) && layer !== chosenLayer;

                    return (
                      <button
                        key={layer}
                        type="button"
                        className={styles.foldButton}
                        aria-pressed={isFolded}
                        disabled={layer === chosenLayer}
                        title={layer === chosenLayer ? "It holds the chosen step." : undefined}
                        aria-label={`${isFolded ? "Unfold" : "Fold"} layer ${String(layer + 1)}`}
                        onClick={() => {
                          fold(layer);
                        }}
                      >
                        Layer {layer + 1}
                        <span className={styles.foldCount}>
                          {layered?.[layer]?.length ?? 0} steps
                        </span>
                      </button>
                    );
                  })}
                </Panel>
              )}
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
          {editing
            ? "Drag from a step's right edge to another step to run it after; Delete removes what is chosen."
            : "Choose a step for its details and paths; the arrow keys move between steps."}
        </span>
      </figcaption>
    </figure>
  );
}
