"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

export type MapNode = { id: string; name: string; type: string; status: string };
export type MapEdge = { id: string; source: string; target: string; type: string };

type SimNode = MapNode & { x: number; y: number; vx: number; vy: number; r: number; fixed: boolean };

const CI_COLOR: Record<string, string> = {
  server:      "#3b82f6",
  service:     "#22c55e",
  database:    "#f97316",
  network:     "#a855f7",
  application: "#6366f1",
  cloud:       "#06b6d4",
};

const STATUS_STROKE: Record<string, string> = {
  operational: "#22c55e",
  degraded:    "#eab308",
  down:        "#ef4444",
  planned:     "#94a3b8",
};

const W = 900;
const H = 500;

interface ServiceMapProps {
  nodes: MapNode[];
  edges: MapEdge[];
}

export function ServiceMap({ nodes, edges }: ServiceMapProps) {
  const simRef  = useRef<SimNode[]>([]);
  const rafRef  = useRef<number>(0);
  const alphaRef = useRef(1.0);
  const dragRef = useRef<{ id: string; ox: number; oy: number } | null>(null);
  const svgRef  = useRef<SVGSVGElement>(null);
  const [, setTick] = useState(0); // force re-render
  const [zoom, setZoom]       = useState(1);
  const [selected, setSelected] = useState<SimNode | null>(null);

  const connCount = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of edges) {
      m[e.source] = (m[e.source] || 0) + 1;
      m[e.target] = (m[e.target] || 0) + 1;
    }
    return m;
  }, [edges]);

  // Initialise node positions on a circle
  useEffect(() => {
    simRef.current = nodes.map((n, i) => {
      const angle = (i / Math.max(nodes.length, 1)) * 2 * Math.PI;
      const rr = Math.min(W, H) * 0.3;
      return {
        ...n,
        x: W / 2 + rr * Math.cos(angle) + (Math.random() - 0.5) * 10,
        y: H / 2 + rr * Math.sin(angle) + (Math.random() - 0.5) * 10,
        vx: 0, vy: 0,
        r: 14 + Math.min((connCount[n.id] || 0) * 2, 16),
        fixed: false,
      };
    });
    alphaRef.current = 1.0;
    setTick(t => t + 1);
  }, [nodes, connCount]);

  // Force simulation loop
  useEffect(() => {
    const REPULSION  = 4500;
    const SPRING_LEN = 140;
    const SPRING_K   = 0.04;
    const DAMPING    = 0.86;
    const CENTER_K   = 0.003;
    const ALPHA_DECAY = 0.978;

    const tick = () => {
      const ns = simRef.current;
      const isDragging = dragRef.current !== null;

      if (ns.length > 0 && (alphaRef.current > 0.004 || isDragging)) {
        const alpha = Math.max(alphaRef.current, isDragging ? 0.15 : 0);

        // Repulsion between every pair of nodes
        for (let i = 0; i < ns.length; i++) {
          for (let j = i + 1; j < ns.length; j++) {
            const dx = ns[j]!.x - ns[i]!.x;
            const dy = ns[j]!.y - ns[i]!.y;
            const d2 = dx * dx + dy * dy || 1;
            const d  = Math.sqrt(d2);
            const f  = (REPULSION * alpha) / d2;
            const fx = (dx / d) * f, fy = (dy / d) * f;
            ns[i]!.vx -= fx; ns[i]!.vy -= fy;
            ns[j]!.vx += fx; ns[j]!.vy += fy;
          }
        }

        // Spring attraction along edges
        const nm = new Map(ns.map(n => [n.id, n]));
        for (const e of edges) {
          const s = nm.get(e.source), t = nm.get(e.target);
          if (!s || !t) continue;
          const dx = t.x - s.x, dy = t.y - s.y;
          const d  = Math.sqrt(dx * dx + dy * dy) || 1;
          const f  = SPRING_K * (d - SPRING_LEN) * alpha;
          const fx = (dx / d) * f, fy = (dy / d) * f;
          s.vx += fx; s.vy += fy;
          t.vx -= fx; t.vy -= fy;
        }

        for (const n of ns) {
          if (n.fixed) continue;
          n.vx += (W / 2 - n.x) * CENTER_K * alpha;
          n.vy += (H / 2 - n.y) * CENTER_K * alpha;
          n.vx *= DAMPING; n.vy *= DAMPING;
          n.x = Math.max(n.r, Math.min(W - n.r, n.x + n.vx));
          n.y = Math.max(n.r, Math.min(H - n.r, n.y + n.vy));
        }

        alphaRef.current *= ALPHA_DECAY;
        setTick(t => t + 1);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [edges]);

  // Convert mouse client coordinates to SVG node-space coords
  const toSVGCoords = useCallback((e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const vbW = W / zoom, vbH = H / zoom;
    const vbX = (W - vbW) / 2, vbY = (H - vbH) / 2;
    return {
      x: vbX + ((e.clientX - rect.left) / rect.width)  * vbW,
      y: vbY + ((e.clientY - rect.top)  / rect.height) * vbH,
    };
  }, [zoom]);

  const onNodeDown = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const n = simRef.current.find(n => n.id === id);
    if (!n) return;
    const { x, y } = toSVGCoords(e);
    n.fixed = true; n.vx = 0; n.vy = 0;
    dragRef.current = { id, ox: x - n.x, oy: y - n.y };
    alphaRef.current = Math.max(alphaRef.current, 0.3);
  }, [toSVGCoords]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const n = simRef.current.find(n => n.id === d.id);
    if (!n) return;
    const { x, y } = toSVGCoords(e);
    n.x = Math.max(n.r, Math.min(W - n.r, x - d.ox));
    n.y = Math.max(n.r, Math.min(H - n.r, y - d.oy));
    setTick(t => t + 1);
  }, [toSVGCoords]);

  const onMouseUp = useCallback(() => {
    if (!dragRef.current) return;
    const n = simRef.current.find(n => n.id === dragRef.current!.id);
    if (n) { n.fixed = false; alphaRef.current = Math.max(alphaRef.current, 0.2); }
    dragRef.current = null;
  }, []);

  const vbW = W / zoom, vbH = H / zoom;
  const vbX = (W - vbW) / 2, vbY = (H - vbH) / 2;
  const ns = simRef.current;

  return (
    <div className="relative select-none">
      {/* Zoom controls */}
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
        {([
          { Icon: ZoomIn,   fn: () => setZoom(z => Math.min(z * 1.3, 4))   },
          { Icon: ZoomOut,  fn: () => setZoom(z => Math.max(z / 1.3, 0.25)) },
          { Icon: RotateCcw, fn: () => { setZoom(1); alphaRef.current = 1.0; } },
        ] as const).map(({ Icon, fn }, i) => (
          <button key={i} onClick={fn}
            className="w-7 h-7 bg-card border border-border rounded flex items-center justify-center hover:bg-muted shadow-sm">
            <Icon className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        ))}
      </div>

      {/* Type legend */}
      <div className="absolute bottom-2 left-2 z-10 flex flex-wrap gap-x-3 gap-y-1">
        {Object.entries(CI_COLOR).map(([type, color]) => (
          <span key={type} className="flex items-center gap-1 text-[9px] text-muted-foreground">
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: color }} />
            {type}
          </span>
        ))}
      </div>

      <svg ref={svgRef} width="100%" height={H}
        viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
        className="bg-muted/20 rounded border border-border/50"
        style={{ cursor: dragRef.current ? "grabbing" : "crosshair" }}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <defs>
          <marker id="sm-arrow" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
            <polygon points="0 0,6 2,0 4" fill="#94a3b8" opacity="0.7" />
          </marker>
        </defs>

        {/* Edges */}
        {edges.map(e => {
          const s = ns.find(n => n.id === e.source);
          const t = ns.find(n => n.id === e.target);
          if (!s || !t) return null;
          const dx = t.x - s.x, dy = t.y - s.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          return (
            <line key={e.id}
              x1={s.x} y1={s.y}
              x2={t.x - (dx / len) * (t.r + 6)}
              y2={t.y - (dy / len) * (t.r + 6)}
              stroke="#94a3b8" strokeWidth={1.5} opacity={0.5}
              markerEnd="url(#sm-arrow)"
            />
          );
        })}

        {/* Nodes */}
        {ns.map(node => {
          const color  = CI_COLOR[node.type]   || "#94a3b8";
          const stroke = STATUS_STROKE[node.status] || "#94a3b8";
          const isSel  = node.id === selected?.id;
          return (
            <g key={node.id} transform={`translate(${node.x},${node.y})`}
              onClick={() => setSelected(isSel ? null : node)}
              onMouseDown={e => onNodeDown(e, node.id)}
              style={{ cursor: "pointer" }}>
              {isSel && (
                <circle r={node.r + 8} fill={color} fillOpacity={0.12}
                  stroke={color} strokeWidth={1.5} strokeDasharray="4 2" />
              )}
              <circle r={node.r} fill={color} fillOpacity={0.18} stroke={stroke} strokeWidth={2} />
              <circle r={node.r * 0.42} fill={color} fillOpacity={0.85} />
              <text textAnchor="middle" y={node.r + 11} fontSize={9}
                fill="#64748b" className="pointer-events-none">
                {node.name.length > 16 ? node.name.slice(0, 14) + "…" : node.name}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Selected-node detail panel */}
      {selected && (
        <div className="absolute top-2 left-2 z-20 bg-card border border-border rounded-lg shadow-lg p-3 w-44">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-foreground truncate">{selected.name}</span>
            <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground text-xs ml-1 flex-shrink-0">✕</button>
          </div>
          <div className="space-y-1">
            {[
              ["Type",   selected.type,   CI_COLOR[selected.type]   || "#94a3b8"],
              ["Status", selected.status, STATUS_STROKE[selected.status] || "#94a3b8"],
              ["Links",  String(connCount[selected.id] || 0), undefined],
            ].map(([label, value, color]) => (
              <div key={label as string} className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">{label}</span>
                <span className="capitalize font-medium" style={color ? { color: color as string } : undefined}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
