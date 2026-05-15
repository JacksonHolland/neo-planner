"use client";

import React, { useEffect, useState } from "react";

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

const TARGET_FIELDS: { name: string; type: string; group: string; meaning: string }[] = [
  // Identity
  { name: "designation", type: "string", group: "Identity", meaning: "Unique identifier within its source (e.g. \"2024 AB12\" or \"rubin_170389...\")." },
  { name: "source", type: "string", group: "Identity", meaning: "Slug of the data source that produced this target (e.g. \"neocp\", \"fink_ztf\")." },
  { name: "source_url", type: "string?", group: "Identity", meaning: "Optional canonical URL where the target lives on its source's website." },

  // Classification
  { name: "target_class", type: "string", group: "Classification", meaning: "Class slug, matches /classes/{name}." },
  { name: "catalogued", type: "boolean?", group: "Classification", meaning: "True if the object is in the class's canonical catalog (MPC for NEO, TNS for Supernova)." },
  { name: "catalog_match", type: "string?", group: "Classification", meaning: "The designation in the canonical catalog when catalogued is true." },

  // Pointing
  { name: "ra_deg", type: "number", group: "Pointing (use these)", meaning: "Right Ascension, decimal degrees, J2000 ICRS. Extrapolated to the time noted by epoch." },
  { name: "dec_deg", type: "number", group: "Pointing (use these)", meaning: "Declination, decimal degrees, J2000 ICRS. Extrapolated to the time noted by epoch." },
  { name: "epoch", type: "iso datetime", group: "Pointing (use these)", meaning: "UTC time at which ra_deg / dec_deg are valid. Usually within seconds of the API request time." },
  { name: "motion_rate_arcsec_min", type: "number?", group: "Pointing (use these)", meaning: "On-sky angular rate of motion in arcsec per minute (null for stationary sources)." },
  { name: "motion_pa_deg", type: "number?", group: "Pointing (use these)", meaning: "Position angle of motion, degrees, measured north through east." },

  // Original measurement
  { name: "observed_at", type: "iso datetime?", group: "Original measurement", meaning: "UTC time of the original astrometric measurement that seeded this target. Use with motion_rate + motion_pa to redo your own extrapolation if needed." },

  // Brightness
  { name: "mag_v", type: "number?", group: "Brightness", meaning: "Predicted apparent V-band magnitude (AB system)." },
  { name: "mag_h", type: "number?", group: "Brightness", meaning: "Absolute magnitude H. Lower H = larger object." },

  // Orbit / hazard context
  { name: "n_obs", type: "integer", group: "Orbit / hazard context", meaning: "Number of historical detections used in the source's orbit fit." },
  { name: "arc_days", type: "number", group: "Orbit / hazard context", meaning: "Time span between first and last astrometric measurement (days)." },
  { name: "not_seen_days", type: "number", group: "Orbit / hazard context", meaning: "Days since the most recent measurement (NEOCP-style)." },
  { name: "neo_score", type: "number?", group: "Orbit / hazard context", meaning: "0–100; JPL Scout's probability that the object is an NEO." },
  { name: "pha_score", type: "number?", group: "Orbit / hazard context", meaning: "0–100; potentially hazardous asteroid score (Scout)." },
  { name: "impact_prob", type: "number?", group: "Orbit / hazard context", meaning: "JPL Sentry's cumulative Earth impact probability over the next ~100 years." },

  // Observability
  { name: "observable", type: "boolean", group: "Observability (computed for your site)", meaning: "True if the target is above horizon + meets all telescope-profile constraints sometime tonight." },
  { name: "obs_window_start", type: "iso datetime?", group: "Observability (computed for your site)", meaning: "Earliest UTC time the target meets all constraints tonight." },
  { name: "obs_window_end", type: "iso datetime?", group: "Observability (computed for your site)", meaning: "Latest UTC time the target meets all constraints tonight." },
  { name: "obs_window_hours", type: "number?", group: "Observability (computed for your site)", meaning: "Length of the observable window (hours)." },
  { name: "best_altitude_deg", type: "number?", group: "Observability (computed for your site)", meaning: "Maximum altitude the target reaches during the observable window." },
  { name: "best_airmass", type: "number?", group: "Observability (computed for your site)", meaning: "Minimum airmass during the observable window (1.0 = zenith)." },
  { name: "best_az_deg", type: "number?", group: "Observability (computed for your site)", meaning: "Azimuth at the moment of best altitude." },
  { name: "best_ha_hours", type: "number?", group: "Observability (computed for your site)", meaning: "Hour angle at the moment of best altitude." },
  { name: "moon_sep_deg", type: "number?", group: "Observability (computed for your site)", meaning: "Minimum angular separation from the Moon during the observable window." },
  { name: "transit_time", type: "iso datetime?", group: "Observability (computed for your site)", meaning: "UTC time of meridian transit (target at its highest)." },
];

const FIELD_GROUPS = [
  "Identity",
  "Classification",
  "Pointing (use these)",
  "Original measurement",
  "Brightness",
  "Orbit / hazard context",
  "Observability (computed for your site)",
];

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
      {/* Hero / quick start */}
      <section className="rounded-lg border border-white/15 bg-black/70 backdrop-blur-sm p-5 space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-white">API</h1>
          <p className="text-sm text-white/85">
            JSON over HTTP. No authentication. Wide-open CORS. Designed to be polled by
            telescope schedulers, observation-planning tools, and dashboards. The full
            machine-readable OpenAPI spec is at{" "}
            <a href={`${API_BASE}/docs`} target="_blank" rel="noreferrer" className="text-white underline decoration-white/50 hover:decoration-white">/docs</a>{", "}
            <a href={`${API_BASE}/redoc`} target="_blank" rel="noreferrer" className="text-white underline decoration-white/50 hover:decoration-white">/redoc</a>{", "}
            and{" "}
            <a href={`${API_BASE}/openapi.json`} target="_blank" rel="noreferrer" className="text-white underline decoration-white/50 hover:decoration-white">/openapi.json</a>.
          </p>
        </header>

        <div className="space-y-2">
          <h2 className="text-base font-semibold text-white">Telescope automation — 30 second start</h2>
          <ol className="text-sm text-white/85 list-decimal pl-5 space-y-1">
            <li>One-time: <code className="text-white">GET /classes</code> to discover what target classes are available and what filters each accepts.</li>
            <li>Each polling cycle: <code className="text-white">GET /classes/&#123;name&#125;/targets?lat=…&amp;lon=…&amp;…</code> to receive the current observable target list, ranked for your site.</li>
            <li>For each returned target: <code className="text-white">ra_deg</code>, <code className="text-white">dec_deg</code>, <code className="text-white">epoch</code> are J2000 ICRS, already extrapolated to the time of your request. Hand them to your telescope control system.</li>
            <li>If your pointing happens minutes later, recompute the position yourself from <code className="text-white">observed_at</code> + <code className="text-white">motion_rate_arcsec_min</code> + <code className="text-white">motion_pa_deg</code>.</li>
          </ol>
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-semibold text-white">Python example</h2>
          <Code>{`import time
import requests

API = "${API_BASE}"

# Your site + telescope profile. These are the standard observer fields
# that every class accepts; per-class extras are documented below.
SITE = {
    "lat": 42.6097,                # Wallace
    "lon": -71.4844,
    "alt_m": 180,
    "limiting_mag": 19.0,
    "min_altitude_deg": 25,
    "min_moon_sep_deg": 30,
}

def fetch(class_name, **filters):
    r = requests.get(
        f"{API}/classes/{class_name}/targets",
        params={**SITE, **filters},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["targets"]

# Poll every 3 minutes for catalogued NEOs that need follow-up astrometry
seen = set()
while True:
    for t in fetch("neo", catalogued=True, n_targets=10):
        key = (t["designation"], t["observed_at"])
        if key in seen:
            continue
        seen.add(key)
        # ra_deg/dec_deg/epoch are J2000 ICRS, valid as of "epoch"
        print(t["designation"], t["ra_deg"], t["dec_deg"], "mag", t["mag_v"])
        # ... slew + expose + write astrometry back to MPC ...
    time.sleep(180)`}</Code>
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-semibold text-white">Conventions</h2>
          <ul className="text-sm text-white/85 list-disc pl-5 space-y-1">
            <li><span className="text-white font-medium">Coordinates</span> — J2000 ICRS, decimal degrees. RA ∈ [0, 360), Dec ∈ [-90, 90].</li>
            <li><span className="text-white font-medium">Times</span> — UTC, ISO 8601 with offset, e.g. <code>2026-05-15T03:42:00+00:00</code>.</li>
            <li><span className="text-white font-medium">Motion</span> — <code>motion_rate_arcsec_min</code> in arcseconds per minute on-sky. <code>motion_pa_deg</code> measured north through east.</li>
            <li><span className="text-white font-medium">Magnitudes</span> — AB system. <code>mag_v</code> is apparent, <code>mag_h</code> is absolute (H, asteroid convention).</li>
            <li><span className="text-white font-medium">Null vs. missing</span> — fields that don't apply to a given target are returned as <code>null</code>, not omitted.</li>
            <li><span className="text-white font-medium">Polling cadence</span> — the cache is updated continuously by background Kafka consumers; new alerts appear within seconds to minutes of survey emission. Polling every 1-5 minutes is appropriate for automation; faster than that is wasteful.</li>
            <li><span className="text-white font-medium">Caching</span> — responses are computed fresh per request (positions re-extrapolated to "now"). Don't cache responses for more than ~1 minute if you care about freshness.</li>
            <li><span className="text-white font-medium">Rate limit</span> — none, but be reasonable; a single client doesn't need to poll faster than 60s.</li>
          </ul>
        </div>
      </section>

      {/* Endpoints */}
      <section className="rounded-lg border border-white/15 bg-black/70 backdrop-blur-sm p-5 space-y-5">
        <h2 className="text-xl font-semibold text-white">Endpoints</h2>
        <Endpoint
          method="GET"
          path="/classes"
          summary="list every registered class"
          description="One entry per class with its label, description, canonical catalog, source list (with outbound URLs), full JSON schema for its filter query params, and any presets. Call this once at startup to learn what your client can ask for."
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
    "filters_schema": { /* full JSON Schema, drives the form below */ },
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
          description="Same shape as one entry from /classes. Useful when the client already knows the class name and only needs the filter schema or presets."
          paramsExample={`curl ${API_BASE}/classes/neo`}
          responseExample={`{ "name": "neo", "label": "Near-Earth Objects", /* … */ }`}
        />

        <Endpoint
          method="GET"
          path="/classes/{name}/targets"
          summary="observable, filtered targets for the named class"
          description={
            "Query params are the class's filter fields (full table per class below). The endpoint applies the class's filter, runs the generic observability engine (above-horizon, dark, moon separation, hour-angle / azimuth limits), linearly extrapolates moving-object positions to the time of the request, and returns the top n_targets. Validation failures come back as HTTP 422 with a structured payload (see Errors below)."
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
      "transit_time": "2026-05-15T05:14:00+00:00",
      "moon_sep_deg": 95.4
    }
  ]
}`}
        />

        <Endpoint
          method="GET"
          path="/health"
          summary="liveness probe + per-class cache counts"
          description="The registered classes, their declared sources, and the current cache size per class. Use for monitoring or to confirm ingestion threads are running before you start polling."
          paramsExample={`curl ${API_BASE}/health`}
          responseExample={`{
  "status": "ok",
  "classes": {
    "neo":       { "cached_targets": 162, "sources": ["neocp", "scout", "sentry", "fink_lsst", "fink_ztf"] },
    "supernova": { "cached_targets": 191, "sources": ["fink_lsst", "fink_ztf"] }
  }
}`}
        />
      </section>

      {/* Target response field reference */}
      <section className="rounded-lg border border-white/15 bg-black/70 backdrop-blur-sm p-5 space-y-3">
        <h2 className="text-xl font-semibold text-white">Target response fields</h2>
        <p className="text-sm text-white/85">
          Every entry in the <code className="text-white">targets</code> array of <code className="text-white">/classes/&#123;name&#125;/targets</code> carries this shape. Fields not applicable to a given target are <code className="text-white">null</code>.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-white bg-white/10">
              <tr>
                <th className="text-left px-2 py-1.5">Field</th>
                <th className="text-left px-2 py-1.5">Type</th>
                <th className="text-left px-2 py-1.5">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {FIELD_GROUPS.map((group) => (
                <React.Fragment key={group}>
                  <tr className="bg-white/5">
                    <td colSpan={3} className="px-2 py-1.5 text-white font-semibold text-[11px] uppercase tracking-wide">
                      {group}
                    </td>
                  </tr>
                  {TARGET_FIELDS.filter((f) => f.group === group).map((f) => (
                    <tr key={f.name} className="border-t border-white/10 text-white/95">
                      <td className="px-2 py-1.5 font-mono">{f.name}</td>
                      <td className="px-2 py-1.5 font-mono text-white/80">{f.type}</td>
                      <td className="px-2 py-1.5">{f.meaning}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Errors */}
      <section className="rounded-lg border border-white/15 bg-black/70 backdrop-blur-sm p-5 space-y-3">
        <h2 className="text-xl font-semibold text-white">Errors</h2>
        <div className="space-y-2 text-sm text-white/85">
          <p>
            <span className="font-mono text-white">404</span> — unknown class name on <code>/classes/&#123;name&#125;</code> or its targets endpoint. The response body is{" "}
            <code>&#123;&quot;detail&quot;: &quot;unknown class: foo&quot;&#125;</code>.
          </p>
          <p>
            <span className="font-mono text-white">422</span> — invalid query params. The body lists every failure with both the slug and the human label so the client can render inline errors.
          </p>
        </div>
        <Code>
          {`{
  "detail": {
    "errors": [
      { "field": "lat",          "label": "Latitude (deg)",     "message": "Field required" },
      { "field": "limiting_mag", "label": "Limiting magnitude", "message": "Input should be less than or equal to 30" }
    ]
  }
}`}
        </Code>
      </section>

      {/* Per-class filter + preset reference (auto-generated) */}
      {classes.map((c) => {
        const props = c.filters_schema.properties || {};
        const required = new Set(c.filters_schema.required || []);
        return (
          <section
            key={c.name}
            className="rounded-lg border border-white/15 bg-black/70 backdrop-blur-sm p-5 space-y-3"
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
            <div>
              <h3 className="text-sm font-semibold text-white mb-2">Query parameters</h3>
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
            </div>
          </section>
        );
      })}
    </div>
  );
}
