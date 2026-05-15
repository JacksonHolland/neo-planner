"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type JSONSchemaField = {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  anyOf?: { type: string }[];
};

type JSONSchema = {
  title?: string;
  properties?: Record<string, JSONSchemaField>;
  required?: string[];
};

type ClassInfo = {
  name: string;
  label: string;
  description: string;
  canonical_catalog: string;
  sources: string[];
  filters_schema: JSONSchema;
};

type Target = {
  designation: string;
  source: string;
  source_url: string | null;
  target_class: string | null;
  catalogued: boolean | null;
  catalog_match: string | null;
  ra_deg: number | null;
  dec_deg: number | null;
  epoch: string | null;
  observed_at: string | null;
  motion_rate_arcsec_min: number | null;
  motion_pa_deg: number | null;
  mag_v: number | null;
  mag_h: number | null;
  n_obs: number;
  arc_days: number;
  neo_score: number | null;
  pha_score: number | null;
  impact_prob: number | null;
  observable: boolean | null;
  obs_window_start: string | null;
  obs_window_end: string | null;
  obs_window_hours: number | null;
  best_altitude_deg: number | null;
  best_airmass: number | null;
  moon_sep_deg: number | null;
};

type TargetsResponse = { total: number; class_name: string; targets: Target[] };

function fieldUnderlyingType(f: JSONSchemaField): string {
  if (f.type) return f.type;
  if (f.anyOf) {
    const nonNull = f.anyOf.find((a) => a.type && a.type !== "null");
    if (nonNull?.type) return nonNull.type;
  }
  return "string";
}

function inputForField(
  fieldName: string,
  field: JSONSchemaField,
  value: string,
  onChange: (v: string) => void,
) {
  const type = fieldUnderlyingType(field);
  if (type === "boolean") {
    return (
      <select
        className="w-full bg-black/40 border border-white/15 rounded px-2 py-1.5 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">any</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  return (
    <input
      className="w-full bg-black/40 border border-white/15 rounded px-2 py-1.5 text-sm"
      type={type === "integer" || type === "number" ? "number" : "text"}
      step={type === "number" ? "any" : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.default !== undefined ? String(field.default) : ""}
    />
  );
}

function deg2hms(deg: number): string {
  const h = deg / 15;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const ss = ((h - hh) * 60 - mm) * 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${ss.toFixed(1).padStart(4, "0")}`;
}

function deg2dms(deg: number): string {
  const sign = deg < 0 ? "-" : "+";
  const d = Math.abs(deg);
  const dd = Math.floor(d);
  const mm = Math.floor((d - dd) * 60);
  const ss = ((d - dd) * 60 - mm) * 60;
  return `${sign}${String(dd).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${ss.toFixed(1).padStart(4, "0")}`;
}

export default function HomePage() {
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [response, setResponse] = useState<TargetsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/classes`)
      .then((r) => r.json())
      .then((data: ClassInfo[]) => {
        setClasses(data);
        if (data.length > 0) setSelected(data[0].name);
      })
      .catch((e) => setError(`Failed to load classes: ${e}`));
  }, []);

  const currentClass = useMemo(
    () => classes.find((c) => c.name === selected),
    [classes, selected],
  );

  useEffect(() => {
    if (!currentClass) return;
    const props = currentClass.filters_schema.properties || {};
    const defaults: Record<string, string> = {};
    for (const [k, f] of Object.entries(props)) {
      if (f.default !== undefined && f.default !== null) defaults[k] = String(f.default);
      else defaults[k] = "";
    }
    setValues(defaults);
    setResponse(null);
  }, [currentClass]);

  const submit = useCallback(async () => {
    if (!currentClass) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(values)) {
        if (v === "" || v === undefined || v === null) continue;
        params.set(k, v);
      }
      const url = `${API_BASE}/classes/${currentClass.name}/targets?${params}`;
      const r = await fetch(url);
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`${r.status} ${t}`);
      }
      const data: TargetsResponse = await r.json();
      setResponse(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [currentClass, values]);

  const props = currentClass?.filters_schema.properties || {};
  const required = new Set(currentClass?.filters_schema.required || []);

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-white/70">Class</label>
        <select
          className="bg-black/40 border border-white/15 rounded px-3 py-2 text-sm"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {classes.map((c) => (
            <option key={c.name} value={c.name}>
              {c.label}
            </option>
          ))}
        </select>
        {currentClass && (
          <span className="text-xs text-white/50">
            canonical: {currentClass.canonical_catalog} · sources: {currentClass.sources.join(", ")}
          </span>
        )}
      </section>

      {currentClass && (
        <section className="rounded-lg border border-white/10 bg-black/30 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(props).map(([k, f]) => (
              <label key={k} className="text-xs text-white/70 flex flex-col gap-1">
                <span className="flex items-center gap-1">
                  {k}
                  {required.has(k) && <span className="text-red-400">*</span>}
                </span>
                {inputForField(k, f, values[k] ?? "", (v) => setValues({ ...values, [k]: v }))}
                {f.description && <span className="text-[10px] text-white/40">{f.description}</span>}
              </label>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={submit}
              disabled={loading}
              className="px-4 py-2 rounded bg-white text-black text-sm font-medium disabled:opacity-50"
            >
              {loading ? "Loading…" : "Find targets"}
            </button>
            {error && <span className="text-sm text-red-400">{error}</span>}
          </div>
        </section>
      )}

      {response && (
        <section className="rounded-lg border border-white/10 bg-black/30 overflow-hidden">
          <div className="px-4 py-2 text-sm text-white/70 border-b border-white/10">
            {response.total} target{response.total === 1 ? "" : "s"}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-white/60 bg-white/5">
                <tr>
                  <th className="px-3 py-2 text-left">Designation</th>
                  <th className="px-3 py-2 text-left">Source</th>
                  <th className="px-3 py-2 text-left">RA</th>
                  <th className="px-3 py-2 text-left">Dec</th>
                  <th className="px-3 py-2 text-right">Mag</th>
                  <th className="px-3 py-2 text-right">Alt</th>
                  <th className="px-3 py-2 text-right">Window</th>
                  <th className="px-3 py-2 text-left">Catalogued</th>
                  <th className="px-3 py-2 text-left">Observed</th>
                </tr>
              </thead>
              <tbody>
                {response.targets.map((t) => (
                  <tr key={t.designation} className="border-t border-white/5 hover:bg-white/5">
                    <td className="px-3 py-2 font-mono text-xs">
                      {t.source_url ? (
                        <a href={t.source_url} target="_blank" rel="noreferrer" className="hover:underline">
                          {t.designation}
                        </a>
                      ) : (
                        t.designation
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-white/70">{t.source}</td>
                    <td className="px-3 py-2 font-mono text-xs">{t.ra_deg !== null ? deg2hms(t.ra_deg) : "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{t.dec_deg !== null ? deg2dms(t.dec_deg) : "—"}</td>
                    <td className="px-3 py-2 text-right">{t.mag_v?.toFixed(1) ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{t.best_altitude_deg?.toFixed(0) ?? "—"}°</td>
                    <td className="px-3 py-2 text-right">{t.obs_window_hours?.toFixed(1) ?? "—"} h</td>
                    <td className="px-3 py-2 text-xs">
                      {t.catalogued === true ? (
                        <span className="text-green-400">{t.catalog_match || "yes"}</span>
                      ) : t.catalogued === false ? (
                        <span className="text-white/40">no</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-white/60">
                      {t.observed_at ? new Date(t.observed_at).toISOString().slice(0, 16).replace("T", " ") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
