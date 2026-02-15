"use client";

import { useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Target {
  designation: string;
  source: string;
  ra_deg: number | null;
  dec_deg: number | null;
  mag_v: number | null;
  mag_h: number | null;
  n_obs: number;
  arc_days: number;
  not_seen_days: number;
  neo_score: number | null;
  pha_score: number | null;
  observable: boolean | null;
  obs_window_start: string | null;
  obs_window_end: string | null;
  obs_window_hours: number | null;
  best_altitude_deg: number | null;
  best_airmass: number | null;
  moon_sep_deg: number | null;
  transit_time: string | null;
  priority_score: number | null;
  source_url: string | null;
}

interface TonightResponse {
  total: number;
  telescope: Record<string, unknown>;
  targets: Target[];
}

function degToHMS(deg: number): string {
  const h = deg / 15;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const ss = ((h - hh) * 60 - mm) * 60;
  return `${hh.toString().padStart(2, "0")}h ${mm
    .toString()
    .padStart(2, "0")}m ${ss.toFixed(1).padStart(4, "0")}s`;
}

function degToDMS(deg: number): string {
  const sign = deg >= 0 ? "+" : "-";
  const abs = Math.abs(deg);
  const dd = Math.floor(abs);
  const mm = Math.floor((abs - dd) * 60);
  const ss = ((abs - dd) * 60 - mm) * 60;
  return `${sign}${dd.toString().padStart(2, "0")}° ${mm
    .toString()
    .padStart(2, "0")}' ${ss.toFixed(1).padStart(4, "0")}"`;
}

function formatUTC(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  }) + " UTC";
}

export default function Home() {
  const [lat, setLat] = useState("42.6138");
  const [lon, setLon] = useState("-71.4889");
  const [limitingMag, setLimitingMag] = useState("19.5");
  const [minAlt, setMinAlt] = useState("20");
  const [results, setResults] = useState<TonightResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function fetchTargets() {
    setLoading(true);
    setError(null);
    setExpanded(null);
    try {
      const params = new URLSearchParams({
        lat,
        lon,
        limiting_mag: limitingMag,
        min_altitude_deg: minAlt,
      });
      const res = await fetch(`${API_BASE}/targets/tonight?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `API error ${res.status}`);
      }
      const data: TonightResponse = await res.json();
      setResults(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError("Geolocation not supported by your browser");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(4));
        setLon(pos.coords.longitude.toFixed(4));
      },
      () => setError("Could not get your location")
    );
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <header className="mb-10 text-center">
        <h1 className="text-4xl font-bold tracking-tight mb-2">
          <span className="text-[var(--accent)]">NEO</span> Target Planner
        </h1>
        <p className="text-[var(--text-secondary)] text-lg max-w-2xl mx-auto">
          Find tonight&apos;s observable Near-Earth Objects for your telescope.
          Enter your location and specs below.
        </p>
      </header>

      {/* Input Form */}
      <section className="bg-[var(--bg-card)] rounded-xl p-6 mb-8 border border-gray-700/50">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1">
              Latitude
            </label>
            <input
              type="number"
              step="0.0001"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="w-full bg-[var(--bg-secondary)] border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1">
              Longitude
            </label>
            <input
              type="number"
              step="0.0001"
              value={lon}
              onChange={(e) => setLon(e.target.value)}
              className="w-full bg-[var(--bg-secondary)] border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1">
              Limiting Magnitude
            </label>
            <input
              type="number"
              step="0.1"
              value={limitingMag}
              onChange={(e) => setLimitingMag(e.target.value)}
              className="w-full bg-[var(--bg-secondary)] border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1">
              Min Altitude (&deg;)
            </label>
            <input
              type="number"
              step="1"
              value={minAlt}
              onChange={(e) => setMinAlt(e.target.value)}
              className="w-full bg-[var(--bg-secondary)] border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchTargets}
            disabled={loading}
            className="bg-[var(--accent)] text-[var(--bg-primary)] font-semibold px-6 py-2 rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
          >
            {loading ? "Searching..." : "Find Targets"}
          </button>
          <button
            onClick={useMyLocation}
            className="border border-gray-600 text-[var(--text-secondary)] px-4 py-2 rounded-lg hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors text-sm"
          >
            Use My Location
          </button>
        </div>
      </section>

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-xl p-4 mb-6">
          {error}
        </div>
      )}

      {/* Results */}
      {results && (
        <section>
          <h2 className="text-xl font-semibold mb-4">
            {results.total === 0
              ? "No observable targets tonight"
              : `${results.total} target${results.total > 1 ? "s" : ""} observable tonight`}
          </h2>

          {results.total > 0 && (
            <div className="space-y-3">
              {results.targets.map((t) => (
                <TargetCard
                  key={t.designation}
                  target={t}
                  isExpanded={expanded === t.designation}
                  onToggle={() =>
                    setExpanded(
                      expanded === t.designation ? null : t.designation
                    )
                  }
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Footer */}
      <footer className="mt-16 pt-8 border-t border-gray-800 text-center text-sm text-[var(--text-secondary)]">
        <p>
          Data from{" "}
          <a
            href="https://www.minorplanetcenter.net/iau/NEO/toconfirm_tabular.html"
            className="text-[var(--accent)] hover:underline"
            target="_blank"
          >
            MPC NEOCP
          </a>{" "}
          &amp;{" "}
          <a
            href="https://cneos.jpl.nasa.gov/scout/"
            className="text-[var(--accent)] hover:underline"
            target="_blank"
          >
            JPL Scout
          </a>
          . Built at MIT for planetary defense.
        </p>
      </footer>
    </main>
  );
}

function TargetCard({
  target: t,
  isExpanded,
  onToggle,
}: {
  target: Target;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`bg-[var(--bg-card)] border rounded-xl transition-colors ${
        isExpanded
          ? "border-[var(--accent)]/50"
          : "border-gray-700/50 hover:border-gray-600"
      }`}
    >
      {/* Summary row — always visible, clickable */}
      <button
        onClick={onToggle}
        className="w-full text-left p-5 flex items-center justify-between cursor-pointer"
      >
        <div className="flex items-center gap-6 flex-wrap">
          <div>
            <h3 className="text-lg font-semibold">{t.designation}</h3>
            <span className="text-xs text-[var(--text-secondary)] uppercase tracking-wider">
              {t.source}
            </span>
          </div>
          <Stat label="Mag" value={t.mag_v?.toFixed(1) ?? "—"} />
          <Stat
            label="Window"
            value={t.obs_window_hours ? `${t.obs_window_hours}h` : "—"}
          />
          <Stat
            label="Best Alt"
            value={t.best_altitude_deg ? `${t.best_altitude_deg}°` : "—"}
          />
        </div>
        <svg
          className={`w-5 h-5 text-[var(--text-secondary)] transition-transform ${
            isExpanded ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Detail panel — shown when expanded */}
      {isExpanded && (
        <div className="border-t border-gray-700/50 p-5 space-y-5">
          {/* Position */}
          <Section title="Position">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-[var(--text-secondary)] mb-1">
                  Right Ascension
                </div>
                <div className="font-mono text-lg">
                  {t.ra_deg != null ? degToHMS(t.ra_deg) : "—"}
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  {t.ra_deg != null ? `${t.ra_deg.toFixed(5)}°` : ""}
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-secondary)] mb-1">
                  Declination
                </div>
                <div className="font-mono text-lg">
                  {t.dec_deg != null ? degToDMS(t.dec_deg) : "—"}
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  {t.dec_deg != null ? `${t.dec_deg.toFixed(5)}°` : ""}
                </div>
              </div>
            </div>
          </Section>

          {/* Observability */}
          <Section title="Observability">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
              <DetailStat
                label="Observable Window"
                value={
                  t.obs_window_start && t.obs_window_end
                    ? `${formatUTC(t.obs_window_start)} – ${formatUTC(
                        t.obs_window_end
                      )}`
                    : "—"
                }
              />
              <DetailStat
                label="Duration"
                value={
                  t.obs_window_hours != null
                    ? `${t.obs_window_hours} hours`
                    : "—"
                }
              />
              <DetailStat
                label="Transit Time"
                value={formatUTC(t.transit_time)}
              />
              <DetailStat
                label="Best Altitude"
                value={
                  t.best_altitude_deg != null
                    ? `${t.best_altitude_deg}°`
                    : "—"
                }
              />
              <DetailStat
                label="Best Airmass"
                value={t.best_airmass?.toFixed(2) ?? "—"}
              />
              <DetailStat
                label="Moon Separation"
                value={
                  t.moon_sep_deg != null ? `${t.moon_sep_deg}°` : "—"
                }
              />
            </div>
          </Section>

          {/* Photometry */}
          <Section title="Photometry">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
              <DetailStat
                label="Apparent Magnitude (V)"
                value={t.mag_v?.toFixed(1) ?? "—"}
              />
              <DetailStat
                label="Absolute Magnitude (H)"
                value={t.mag_h?.toFixed(1) ?? "—"}
              />
            </div>
          </Section>

          {/* Orbit info */}
          <Section title="Orbit Status">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
              <DetailStat
                label="Observations"
                value={String(t.n_obs)}
              />
              <DetailStat
                label="Arc Length"
                value={`${t.arc_days.toFixed(2)} days`}
              />
              <DetailStat
                label="Last Observed"
                value={`${t.not_seen_days.toFixed(1)} days ago`}
              />
              <DetailStat
                label="NEO Confidence"
                value={
                  t.neo_score != null ? `${t.neo_score.toFixed(0)}%` : "—"
                }
              />
              {t.pha_score != null && t.pha_score > 0 && (
                <DetailStat
                  label="PHA Score"
                  value={`${t.pha_score.toFixed(0)}`}
                />
              )}
            </div>
          </Section>

          {/* Links */}
          <div className="flex gap-3 pt-2">
            {t.source_url && (
              <a
                href={t.source_url}
                target="_blank"
                className="text-sm text-[var(--accent)] hover:underline"
              >
                View on MPC →
              </a>
            )}
            <a
              href={`https://cneos.jpl.nasa.gov/scout/#/object/${t.designation}`}
              target="_blank"
              className="text-sm text-[var(--accent)] hover:underline"
            >
              View on Scout →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
        {title}
      </h4>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[var(--text-secondary)] text-xs">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[var(--text-secondary)] text-xs mb-0.5">
        {label}
      </div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
