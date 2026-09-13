"use client";

import { memo } from "react";
import { CENTRAL_MERIDIANS, PROJECTIONS, type ProjectionId } from "@/lib/projections";
import {
  BASE_STYLES,
  LAYERS,
  type BaseStyleId,
  type LayerId,
} from "@/lib/styles";

export interface ControlPanelProps {
  chrome: "dark" | "light";
  open: boolean;
  onToggle: () => void;
  styleId: BaseStyleId;
  onStyleChange: (id: BaseStyleId) => void;
  layers: Record<LayerId, boolean>;
  onLayerToggle: (id: LayerId) => void;
  projectionId: ProjectionId;
  onProjectionChange: (id: ProjectionId) => void;
  lambda0: number;
  onLambda0Change: (value: number) => void;
  loading: boolean;
}

function ControlPanel({
  chrome,
  open,
  onToggle,
  styleId,
  onStyleChange,
  layers,
  onLayerToggle,
  projectionId,
  onProjectionChange,
  lambda0,
  onLambda0Change,
  loading,
}: ControlPanelProps) {
  const dark = chrome === "dark";
  const shell = dark
    ? "bg-slate-950/80 text-slate-100 ring-white/10"
    : "bg-white/85 text-slate-800 ring-slate-900/10";
  const muted = dark ? "text-slate-400" : "text-slate-500";
  const divider = dark ? "border-white/10" : "border-slate-900/10";
  const field = dark
    ? "bg-white/5 text-slate-100 ring-white/10 hover:bg-white/10"
    : "bg-slate-900/[0.04] text-slate-800 ring-slate-900/10 hover:bg-slate-900/[0.07]";

  return (
    <div className="pointer-events-none absolute left-4 top-4 z-10 flex max-h-[calc(100dvh-2rem)] w-[19rem] max-w-[calc(100vw-2rem)] flex-col">
      <div
        className={`pointer-events-auto flex flex-col overflow-hidden rounded-2xl shadow-xl ring-1 backdrop-blur-md ${shell}`}
      >
        <button
          type="button"
          onClick={onToggle}
          className="flex shrink-0 items-center gap-3 px-4 py-3 text-left"
          aria-expanded={open}
        >
          <span className="flex-1">
            <span className="block text-sm font-semibold tracking-tight">Equirealm</span>
            <span className={`block text-[11px] ${muted}`}>
              {loading ? "Loading world data…" : "Equal-area world map"}
            </span>
          </span>
          <span
            className={`text-xs transition-transform ${muted} ${open ? "rotate-180" : ""}`}
            aria-hidden
          >
            ▾
          </span>
        </button>

        {open && (
          <div className={`min-h-0 overflow-y-auto border-t px-4 pb-4 ${divider}`}>
            <Section label="Base map" muted={muted}>
              <div className="grid gap-1">
                {BASE_STYLES.map((style) => {
                  const active = style.id === styleId;
                  return (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => onStyleChange(style.id)}
                      className={`rounded-lg px-3 py-2 text-left ring-1 transition ${
                        active
                          ? dark
                            ? "bg-sky-400/20 ring-sky-300/40"
                            : "bg-sky-500/15 ring-sky-600/30"
                          : `ring-transparent ${field}`
                      }`}
                    >
                      <span className="block text-[13px] font-medium">{style.label}</span>
                      <span className={`block text-[11px] ${muted}`}>{style.blurb}</span>
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section label="Layers" muted={muted}>
              <div className="grid gap-0.5">
                {LAYERS.map((layer) => (
                  <label
                    key={layer.id}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 ${
                      dark ? "hover:bg-white/5" : "hover:bg-slate-900/5"
                    }`}
                    title={layer.hint}
                  >
                    <input
                      type="checkbox"
                      checked={layers[layer.id]}
                      onChange={() => onLayerToggle(layer.id)}
                      className="mt-0.5 h-3.5 w-3.5 accent-sky-500"
                    />
                    <span className="text-[13px] leading-snug">{layer.label}</span>
                  </label>
                ))}
              </div>
            </Section>

            <Section label="Projection" muted={muted}>
              <select
                value={projectionId}
                onChange={(event) => onProjectionChange(event.target.value as ProjectionId)}
                className={`w-full rounded-lg px-2.5 py-2 text-[13px] ring-1 outline-none ${field}`}
              >
                {PROJECTIONS.map((projection) => (
                  <option key={projection.id} value={projection.id} className="text-slate-900">
                    {projection.label}
                    {projection.equalArea ? " — equal-area" : ""}
                  </option>
                ))}
              </select>
              <p className={`mt-1.5 text-[11px] leading-snug ${muted}`}>
                {PROJECTIONS.find((p) => p.id === projectionId)?.note}
              </p>
            </Section>

            <Section label="Central meridian" muted={muted}>
              <select
                value={lambda0}
                onChange={(event) => onLambda0Change(Number(event.target.value))}
                className={`w-full rounded-lg px-2.5 py-2 text-[13px] ring-1 outline-none ${field}`}
              >
                {CENTRAL_MERIDIANS.map((meridian) => (
                  <option key={meridian.value} value={meridian.value} className="text-slate-900">
                    {meridian.label}
                  </option>
                ))}
              </select>
            </Section>

            <p className={`mt-4 border-t pt-3 text-[10px] leading-relaxed ${divider} ${muted}`}>
              Vectors &amp; relief: Natural Earth (public domain). Satellite and night imagery:
              NASA Blue Marble. Scroll or pinch to zoom, drag to pan.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Memoised: the map repaints far more often than these controls change.
export default memo(ControlPanel);

function Section({
  label,
  muted,
  children,
}: {
  label: string;
  muted: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-4 first:mt-3">
      <h2 className={`mb-1.5 text-[10px] font-semibold uppercase tracking-[0.09em] ${muted}`}>
        {label}
      </h2>
      {children}
    </section>
  );
}
