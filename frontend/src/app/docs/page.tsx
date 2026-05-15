"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type JSONSchemaField = {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  anyOf?: { type: string }[];
};

type SourceRef = { name: string; label: string; url: string };

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
      <section className="rounded-lg border border-white/15 bg-black/70 backdrop-blur-sm p-4 space-y-2">
        <h1 className="text-2xl font-semibold text-white">API</h1>
        <ul className="text-sm text-white/95 space-y-1 font-mono">
          <li>GET /classes</li>
          <li>GET /classes/&#123;name&#125;</li>
          <li>GET /classes/&#123;name&#125;/targets?lat=&amp;lon=&amp;…</li>
          <li>GET /health</li>
        </ul>
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
