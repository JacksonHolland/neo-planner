"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-black/80 border border-white/15 rounded p-3 text-xs text-white/95 overflow-x-auto font-mono leading-relaxed">
      {children}
    </pre>
  );
}

function Endpoint({
  method,
  path,
  summary,
  description,
  paramsExample,
  responseExample,
}: {
  method: string;
  path: string;
  summary: string;
  description: string;
  paramsExample?: string;
  responseExample: string;
}) {
  return (
    <div className="space-y-2 border-t border-white/10 pt-4 first:border-0 first:pt-0">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-500/40">
          {method}
        </span>
        <code className="text-sm text-white">{path}</code>
        <span className="text-sm text-white/80">— {summary}</span>
      </div>
      <p className="text-sm text-white/85">{description}</p>
      {paramsExample && (
        <div>
          <div className="text-xs text-white/70 mb-1">Example request</div>
          <Code>{paramsExample}</Code>
        </div>
      )}
      <div>
        <div className="text-xs text-white/70 mb-1">Example response</div>
        <Code>{responseExample}</Code>
      </div>
    </div>
  );
}

type JSONSchemaField = {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  anyOf?: { type: string }[];
};

type SourceRef = { name: string; label: string; url: string };

type Preset = {
  name: string;
  label: string;
  description: string;
  values: Record<string, unknown>;
};

type ClassInfo = {
  name: string;
  label: string;
  description: string;
  canonical_catalog: SourceRef;
  sources: SourceRef[];
  filters_schema: {
    properties?: Record<string, JSONSchemaField>;
    required?: string[];
  };
  presets: Preset[];
};

function fieldType(f: JSONSchemaField): string {
  if (f.type) return f.type;
  if (f.anyOf) {
    const nonNull = f.anyOf.find((a) => a.type && a.type !== "null");
    if (nonNull?.type) return `${nonNull.type} (nullable)`;
  }
  return "string";
}

export default function DocsPage() {
  const [classes, setClasses] = useState<ClassInfo[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/classes`)
      .then((r) => r.json())
      .then(setClasses)
      .catch(() => setClasses([]));
  }, []);

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-white/15 bg-black/70 backdrop-blur-sm p-4 space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-white">API</h1>
          <p className="text-sm text-white/80">
            JSON over HTTP. CORS-open and unauthenticated. The full machine-readable
            spec is at{" "}
            <a
              href={`${API_BASE}/docs`}
              target="_blank"
              rel="noreferrer"
              className="text-white underline decoration-white/50 hover:decoration-white"
            >
              /docs (Swagger)
            </a>{" "}
            and{" "}
            <a
              href={`${API_BASE}/redoc`}
              target="_blank"
              rel="noreferrer"
              className="text-white underline decoration-white/50 hover:decoration-white"
            >
              /redoc
            </a>
            ; or as raw OpenAPI JSON at{" "}
            <a
              href={`${API_BASE}/openapi.json`}
              target="_blank"
              rel="noreferrer"
              className="text-white underline decoration-white/50 hover:decoration-white"
            >
              /openapi.json
            </a>
            . Per-class filter schemas and presets are listed below.
          </p>
        </header>

        <div className="space-y-5">
          <Endpoint
            method="GET"
            path="/classes"
            summary="list every registered class"
            description="Returns one entry per class with its label, description, canonical catalog, sources (with outbound URLs), filter JSON schema, and presets. Use this to drive a class-picker UI or to discover what filter params each class accepts."
            paramsExample={`curl ${API_BASE}/classes`}
            responseExample={`[
  {
    "name": "neo",
    "label": "Near-Earth Objects",
    "description": "Near-Earth asteroids and comets. ...",
    "canonical_catalog": {
      "name": "MPC",
      "label": "Minor Planet Center",
      "url": "https://www.minorplanetcenter.net/"
    },
    "sources": [
      { "name": "neocp", "label": "MPC NEOCP", "url": "..." },
      { "name": "fink_ztf", "label": "Fink ZTF", "url": "..." }
    ],
    "filters_schema": { /* JSON Schema for query params */ },
    "presets": [
      {
        "name": "neocp_followup",
        "label": "NEOCP follow-up",
        "description": "Catalogued NEOs that need more astrometry.",
        "values": { "catalogued": true }
      }
    ]
  }
]`}
          />

          <Endpoint
            method="GET"
            path="/classes/{name}"
            summary="detail for one class"
            description="Same shape as one entry from /classes. Useful when a client already knows the class name and only needs the filter schema or presets."
            paramsExample={`curl ${API_BASE}/classes/neo`}
            responseExample={`{
  "name": "neo",
  "label": "Near-Earth Objects",
  "description": "...",
  "canonical_catalog": { "name": "MPC", "label": "Minor Planet Center", "url": "..." },
  "sources": [ ... ],
  "filters_schema": { ... },
  "presets": [ ... ]
}`}
          />

          <Endpoint
            method="GET"
            path="/classes/{name}/targets"
            summary="observable, filtered targets for the named class"
            description={
              "Query params are the class's filter fields (see the per-class table below). The endpoint runs the class's filter, the generic observability engine (above-horizon, dark, moon separation, hour-angle / azimuth limits), then linearly extrapolates moving-object positions to 'now' and returns the top n_targets. Validation errors come back as 422 with a structured payload."
            }
            paramsExample={`curl '${API_BASE}/classes/neo/targets?lat=42.6097&lon=-71.4844&catalogued=true&n_targets=10'`}
            responseExample={`{
  "total": 10,
  "class_name": "neo",
  "targets": [
    {
      "designation": "2024 AB12",
      "source": "neocp",
      "source_url": "https://www.minorplanetcenter.net/...",
      "target_class": "neo",
      "catalogued": true,
      "catalog_match": "2024 AB12",
      "ra_deg": 187.345,
      "dec_deg": 4.21,
      "epoch": "2026-05-15T03:42:00+00:00",
      "observed_at": "2026-05-15T01:22:00+00:00",
      "motion_rate_arcsec_min": 1.42,
      "motion_pa_deg": 73.9,
      "mag_v": 19.4,
      "n_obs": 17,
      "arc_days": 0.6,
      "neo_score": 92.0,
      "observable": true,
      "obs_window_hours": 3.2,
      "best_altitude_deg": 58.0,
      "moon_sep_deg": 95.4
    }
  ]
}`}
          />

          <Endpoint
            method="GET"
            path="/health"
            summary="liveness probe + per-class cache counts"
            description="Returns the registered classes, their declared sources, and the current cache size. Use for monitoring or to confirm ingestion threads are running."
            paramsExample={`curl ${API_BASE}/health`}
            responseExample={`{
  "status": "ok",
  "classes": {
    "neo":       { "cached_targets": 162, "sources": ["neocp", "scout", "sentry", "fink_lsst", "fink_ztf"] },
    "supernova": { "cached_targets": 191, "sources": ["fink_lsst", "fink_ztf"] }
  }
}`}
          />
        </div>

        <div className="border-t border-white/10 pt-4 space-y-2">
          <h2 className="text-sm font-semibold text-white">Validation errors</h2>
          <p className="text-sm text-white/85">
            Invalid query params return HTTP 422 with a structured list of failures.
            Each entry carries the field's slug, its human label, and a message.
          </p>
          <Code>
            {`{
  "detail": {
    "errors": [
      { "field": "lat", "label": "Latitude (deg)", "message": "Field required" },
      { "field": "limiting_mag", "label": "Limiting magnitude",
        "message": "Input should be less than or equal to 30" }
    ]
  }
}`}
          </Code>
        </div>
      </section>

      {classes.map((c) => {
        const props = c.filters_schema.properties || {};
        const required = new Set(c.filters_schema.required || []);
        return (
          <section
            key={c.name}
            className="rounded-lg border border-white/15 bg-black/70 backdrop-blur-sm p-4 space-y-3"
          >
            <header>
              <h2 className="text-xl font-semibold text-white">{c.label}</h2>
              <p className="text-xs text-white/85 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <code className="text-white">{c.name}</code>
                <span className="text-white/40">|</span>
                <span>
                  Canonical catalog:{" "}
                  {c.canonical_catalog.url ? (
                    <a
                      href={c.canonical_catalog.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-white underline decoration-white/50 hover:decoration-white"
                    >
                      {c.canonical_catalog.label}
                    </a>
                  ) : (
                    <span className="text-white">{c.canonical_catalog.label}</span>
                  )}
                </span>
                <span className="text-white/40">|</span>
                <span className="flex flex-wrap items-center gap-x-1">
                  Sources:
                  {c.sources.map((s, i) => (
                    <span key={s.name} className="flex items-center">
                      {s.url ? (
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-white underline decoration-white/50 hover:decoration-white"
                        >
                          {s.label}
                        </a>
                      ) : (
                        <span className="text-white">{s.label}</span>
                      )}
                      {i < c.sources.length - 1 && <span className="text-white/40">,&nbsp;</span>}
                    </span>
                  ))}
                </span>
              </p>
            </header>
            <p className="text-sm text-white/90">{c.description}</p>
            {c.presets.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-white mb-2">Presets</h3>
                <ul className="space-y-1 text-xs text-white/90">
                  {c.presets.map((p) => (
                    <li key={p.name}>
                      <span className="font-medium text-white">{p.label}</span>
                      <span className="text-white/70"> — {p.description}</span>
                      <span className="ml-2 font-mono text-white/60">
                        {Object.entries(p.values)
                          .map(([k, v]) => `${k}=${v}`)
                          .join(", ")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-white bg-white/10">
                  <tr>
                    <th className="text-left px-2 py-1.5">Field</th>
                    <th className="text-left px-2 py-1.5">Query param</th>
                    <th className="text-left px-2 py-1.5">Type</th>
                    <th className="text-left px-2 py-1.5">Default</th>
                    <th className="text-left px-2 py-1.5">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(props).map(([k, f]) => (
                    <tr key={k} className="border-t border-white/10 text-white/95">
                      <td className="px-2 py-1.5">
                        {f.title || k}
                        {required.has(k) && <span className="text-red-400" aria-label="required"> *</span>}
                      </td>
                      <td className="px-2 py-1.5 font-mono">{k}</td>
                      <td className="px-2 py-1.5 font-mono">{fieldType(f)}</td>
                      <td className="px-2 py-1.5 font-mono">
                        {f.default !== undefined && f.default !== null ? String(f.default) : "—"}
                      </td>
                      <td className="px-2 py-1.5">{f.description || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
