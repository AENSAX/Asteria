import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape from "cytoscape";
import dagre from "cytoscape-dagre";
import type { Core, ElementDefinition } from "cytoscape";
import type { TagRelationTree, TagRelationTreeKind } from "../../../shared/ipc";
import { formatTagLabel } from "../utils/tags";
import { useLanguage } from "../utils/language";

interface TagRelationTreeWindowProps {
  tagIds: number[];
  kind: TagRelationTreeKind;
}

let dagreRegistered = false;

function ensureDagreRegistered(): void {
  if (dagreRegistered) {
    return;
  }

  cytoscape.use(dagre);
  dagreRegistered = true;
}

function runGraphLayout(graph: Core): void {
  if (graph.destroyed()) {
    return;
  }

  graph.resize();
  graph.layout(createDagreLayout()).run();
  requestAnimationFrame(() => {
    if (!graph.destroyed()) {
      graph.fit(undefined, 42);
    }
  });
}

export function TagRelationTreeWindow({
  tagIds,
  kind,
}: TagRelationTreeWindowProps): JSX.Element {
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cytoscapeRef = useRef<Core | null>(null);
  const [tree, setTree] = useState<TagRelationTree>({
    nodes: [],
    edges: [],
  });
  const [message, setMessage] = useState(() =>
    t("window.tagRelationTree.loading"),
  );
  const tagIdKey = `${kind}:${tagIds.join(",")}`;
  const elements = useMemo(() => createElements(tree), [tree]);
  const selectedCount = tree.nodes.filter((node) => node.selected).length;
  const titleKey =
    kind === "sibling"
      ? "window.tagRelationTree.siblingTitle"
      : "window.tagRelationTree.title";

  useEffect(() => {
    ensureDagreRegistered();
    void loadTree();
  }, [tagIdKey]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    let disposed = false;
    let graph: Core | null = null;
    let frameId = 0;

    const createGraph = (): void => {
      if (disposed) {
        return;
      }

      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        frameId = requestAnimationFrame(createGraph);
        return;
      }

      cytoscapeRef.current?.destroy();
      const nextGraph = cytoscape({
        container,
        elements,
        layout: { name: "preset" },
        style: createCytoscapeStyle(),
        maxZoom: 2.5,
        minZoom: 0.12,
        wheelSensitivity: 0.18,
      });
      graph = nextGraph;
      cytoscapeRef.current = nextGraph;

      nextGraph.ready(() => runGraphLayout(nextGraph));
    };

    frameId = requestAnimationFrame(createGraph);

    const observer = new ResizeObserver(() => {
      if (graph && !graph.destroyed()) {
        runGraphLayout(graph);
      }
    });
    observer.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      graph?.destroy();
      if (cytoscapeRef.current === graph) {
        cytoscapeRef.current = null;
      }
    };
  }, [elements]);

  async function loadTree(): Promise<void> {
    if (!window.asteria || tagIds.length === 0) {
      setTree({ nodes: [], edges: [] });
      setMessage(t("window.tagRelationTree.noSelection"));
      return;
    }

    try {
      const nextTree = await window.asteria.getTagRelationTree(tagIds, kind);
      setTree(nextTree);
      setMessage(
        t("window.tagRelationTree.loaded", {
          nodeCount: nextTree.nodes.length,
          edgeCount: nextTree.edges.length,
        }),
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : t("window.tagRelationTree.loadFailed"),
      );
    }
  }

  function fitGraph(): void {
    cytoscapeRef.current?.fit(undefined, 42);
  }

  return (
    <section className="grid h-full min-h-0 min-w-0 grid-rows-[32px_minmax(0,1fr)_24px] bg-(--panel) text-[12px] text-(--ink)">
      <header className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1.5 border-b border-(--line) bg-(--panel-strong) px-2">
        <div className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-semibold">
          {t(titleKey)}
          <span className="ml-2 font-normal text-(--muted)">
            {t("window.tagRelationTree.summary", {
              selectedCount,
              nodeCount: tree.nodes.length,
              edgeCount: tree.edges.length,
            })}
          </span>
        </div>
        <button
          className="ui-button ui-button-md"
          type="button"
          onClick={fitGraph}
        >
          {t("window.tagRelationTree.fit")}
        </button>
        <button
          className="ui-button ui-button-md"
          type="button"
          onClick={() => void loadTree()}
        >
          {t("common.refresh")}
        </button>
      </header>

      <main className="relative min-h-0 min-w-0 overflow-hidden bg-(--surface-bg)">
        <div className="absolute inset-0 h-full w-full" ref={containerRef} />
        {tree.nodes.length === 0 ? (
          <div className="absolute inset-0 grid place-items-center text-(--muted)">
            {message}
          </div>
        ) : null}
      </main>

      <footer className="flex items-center justify-between border-t border-(--line) bg-(--surface-bg) px-2 text-(--muted)">
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
          {message}
        </span>
        <span>{t("window.tagRelationTree.readonly")}</span>
      </footer>
    </section>
  );
}

function createElements(tree: TagRelationTree): ElementDefinition[] {
  const nodes: ElementDefinition[] = tree.nodes.map((node) => ({
    data: {
      id: String(node.id),
      label: formatTagLabel(node),
    },
    classes: node.selected ? "selected-root" : "",
  }));
  const edges: ElementDefinition[] = tree.edges.map((edge) => ({
    data: {
      id: `${edge.parentTagId}->${edge.childTagId}`,
      source: String(edge.parentTagId),
      target: String(edge.childTagId),
    },
  }));

  return [...nodes, ...edges];
}

function createDagreLayout(): cytoscape.LayoutOptions {
  return {
    name: "dagre",
    rankDir: "TB",
    nodeSep: 34,
    rankSep: 82,
    edgeSep: 14,
    fit: true,
    padding: 42,
    animate: false,
  } as cytoscape.LayoutOptions;
}

function createCytoscapeStyle(): cytoscape.StylesheetJson {
  const root = getComputedStyle(document.documentElement);
  const panel = readCssColor(root, "--panel", "#202427");
  const surface = readCssColor(root, "--surface-bg", "#1c2023");
  const ink = readCssColor(root, "--ink", "#d7dde3");
  const line = readCssColor(root, "--line-strong", "#3f4850");
  const accent = readCssColor(root, "--accent", "#78b8ff");
  const selection = readCssColor(root, "--pending-border", "#8fc7ff");

  return [
    {
      selector: "core",
      style: {
        "active-bg-opacity": 0,
        "outside-texture-bg-color": panel,
      },
    },
    {
      selector: "node",
      style: {
        width: 148,
        height: 32,
        padding: 6,
        shape: "round-rectangle",
        "background-color": surface,
        "border-width": 1,
        "border-color": line,
        color: ink,
        label: "data(label)",
        "font-size": 11,
        "font-family": "system-ui, sans-serif",
        "text-valign": "center",
        "text-halign": "center",
        "text-wrap": "wrap",
        "text-max-width": 132,
        "overlay-opacity": 0,
      },
    },
    {
      selector: "node.selected-root",
      style: {
        "background-color": "#243140",
        "border-color": selection,
        "border-width": 2,
        color: ink,
      },
    },
    {
      selector: "edge",
      style: {
        width: 1.4,
        "line-color": accent,
        "target-arrow-color": accent,
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
        "arrow-scale": 0.9,
        opacity: 0.78,
      },
    },
    {
      selector: "node:active",
      style: {
        "border-color": selection,
      },
    },
    {
      selector: "edge:active",
      style: {
        "line-color": selection,
        "target-arrow-color": selection,
      },
    },
    {
      selector: "node:selected",
      style: {
        "border-color": selection,
        "border-width": 2,
      },
    },
    {
      selector: "edge:selected",
      style: {
        "line-color": selection,
        "target-arrow-color": selection,
      },
    },
  ] as unknown as cytoscape.StylesheetJson;
}

function readCssColor(
  styles: CSSStyleDeclaration,
  name: string,
  fallback: string,
): string {
  return styles.getPropertyValue(name).trim() || fallback;
}
