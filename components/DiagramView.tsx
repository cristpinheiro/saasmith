"use client"

import { useMemo, useRef, useState } from "react"
import { useProjectStore } from "../lib/store/project"
import type { Module } from "../lib/types"

const BOX_W = 200
const BOX_H = 140
const COLS = 3
const GAP_X = 80
const GAP_Y = 60
const PAD = 40

type Pos = { x: number; y: number }

function modulePos(index: number): Pos {
  const col = index % COLS
  const row = Math.floor(index / COLS)
  return {
    x: PAD + col * (BOX_W + GAP_X),
    y: PAD + row * (BOX_H + GAP_Y),
  }
}

type Relation = {
  fromModule: string
  fieldName: string
  toModule: string
  cardinality: "one" | "many"
  fromPos: Pos
  toPos: Pos
}

function fieldTypeLabel(type: Module["fields"][number]["type"]): string {
  if (typeof type === "string") return type
  if (type.kind === "enum") return `enum`
  return `→ ${type.module}`
}

export default function DiagramView() {
  const project = useProjectStore((s) => s.project)
  const svgRef = useRef<SVGSVGElement>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  const modules = project?.modules ?? []

  const posMap = useMemo(() => {
    const map = new Map<string, Pos>()
    modules.forEach((m, i) => map.set(m.name, modulePos(i)))
    return map
  }, [modules])

  const relations = useMemo<Relation[]>(() => {
    const result: Relation[] = []
    modules.forEach((m) => {
      m.fields.forEach((f) => {
        if (typeof f.type !== "string" && f.type.kind === "relation") {
          const fromPos = posMap.get(m.name)
          const toPos = posMap.get(f.type.module)
          if (fromPos && toPos) {
            result.push({
              fromModule: m.name,
              fieldName: f.name,
              toModule: f.type.module,
              cardinality: f.type.cardinality,
              fromPos,
              toPos,
            })
          }
        }
      })
    })
    return result
  }, [modules, posMap])

  if (!project || modules.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-600">
        No modules to display.
      </div>
    )
  }

  const rows = Math.ceil(modules.length / COLS)
  const svgW = PAD * 2 + Math.min(modules.length, COLS) * (BOX_W + GAP_X) - GAP_X
  const svgH = PAD * 2 + rows * (BOX_H + GAP_Y) - GAP_Y

  function arrowPath(rel: Relation): string {
    const fx = rel.fromPos.x + BOX_W
    const fy = rel.fromPos.y + BOX_H / 2
    const tx = rel.toPos.x
    const ty = rel.toPos.y + BOX_H / 2
    const cx = (fx + tx) / 2
    return `M ${fx} ${fy} C ${cx} ${fy}, ${cx} ${ty}, ${tx} ${ty}`
  }

  function arrowPathSelf(rel: Relation): string {
    const fx = rel.fromPos.x + BOX_W / 2
    const fy = rel.fromPos.y
    return `M ${fx} ${fy} C ${fx} ${fy - 40}, ${fx + 60} ${fy - 40}, ${fx + 60} ${fy}`
  }

  return (
    <div className="flex flex-1 overflow-auto bg-zinc-950 p-4">
      <svg
        ref={svgRef}
        width={svgW}
        height={svgH}
        className="overflow-visible"
        style={{ minWidth: svgW, minHeight: svgH }}
      >
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="8" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#6366f1" />
          </marker>
          <marker id="arrow-many" markerWidth="10" markerHeight="8" refX="8" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 M4,0 L4,8" fill="none" stroke="#6366f1" strokeWidth="1.5" />
          </marker>
        </defs>

        {/* Relation lines */}
        {relations.map((rel, i) => {
          const isSame = rel.fromModule === rel.toModule
          const d = isSame ? arrowPathSelf(rel) : arrowPath(rel)
          const isActive = hovered === rel.fromModule || hovered === rel.toModule
          const mx = isSame
            ? rel.fromPos.x + BOX_W + 30
            : (rel.fromPos.x + BOX_W + rel.toPos.x) / 2
          const my = isSame
            ? rel.fromPos.y - 20
            : (rel.fromPos.y + rel.toPos.y + BOX_H) / 2

          return (
            <g key={i}>
              <path
                d={d}
                fill="none"
                stroke={isActive ? "#818cf8" : "#3f3f46"}
                strokeWidth={isActive ? 2 : 1.5}
                strokeDasharray={rel.cardinality === "many" ? "5,3" : undefined}
                markerEnd={rel.cardinality === "many" ? "url(#arrow-many)" : "url(#arrow)"}
              />
              <text
                x={mx}
                y={my}
                textAnchor="middle"
                fontSize="10"
                fill={isActive ? "#a5b4fc" : "#52525b"}
                className="pointer-events-none select-none"
              >
                {rel.fieldName}
              </text>
            </g>
          )
        })}

        {/* Module boxes */}
        {modules.map((mod) => {
          const pos = posMap.get(mod.name)!
          const isActive = hovered === mod.name
          const relatedModules = new Set(
            relations
              .filter((r) => r.fromModule === mod.name || r.toModule === mod.name)
              .flatMap((r) => [r.fromModule, r.toModule])
          )
          const isRelated = hovered !== null && hovered !== mod.name && relatedModules.has(mod.name)

          return (
            <g
              key={mod.id}
              transform={`translate(${pos.x}, ${pos.y})`}
              onMouseEnter={() => setHovered(mod.name)}
              onMouseLeave={() => setHovered(null)}
              className="cursor-default"
            >
              <rect
                width={BOX_W}
                height={BOX_H}
                rx={8}
                fill={isActive ? "#1e1b4b" : "#18181b"}
                stroke={isActive ? "#6366f1" : isRelated ? "#4f46e5" : "#3f3f46"}
                strokeWidth={isActive || isRelated ? 2 : 1}
              />
              {/* Header */}
              <rect width={BOX_W} height={28} rx={8} fill={isActive ? "#312e81" : "#27272a"} />
              <rect y={20} width={BOX_W} height={8} fill={isActive ? "#312e81" : "#27272a"} />
              <text
                x={10}
                y={18}
                fontSize="12"
                fontWeight="600"
                fill={isActive ? "#c7d2fe" : "#e4e4e7"}
                className="select-none"
              >
                {mod.name}
              </text>
              <text x={BOX_W - 6} y={18} fontSize="9" fill="#52525b" textAnchor="end" className="select-none">
                {mod.tableName}
              </text>

              {/* Fields */}
              {mod.fields.slice(0, 5).map((f, fi) => (
                <g key={f.id} transform={`translate(0, ${32 + fi * 20})`}>
                  <text x={10} y={13} fontSize="10" fill="#a1a1aa" className="select-none">
                    {f.name}
                  </text>
                  <text x={BOX_W - 6} y={13} fontSize="9" fill="#52525b" textAnchor="end" className="select-none">
                    {fieldTypeLabel(f.type)}
                  </text>
                </g>
              ))}
              {mod.fields.length > 5 && (
                <text x={10} y={BOX_H - 8} fontSize="9" fill="#3f3f46" className="select-none">
                  +{mod.fields.length - 5} more fields
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
