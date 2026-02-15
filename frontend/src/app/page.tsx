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
  priority_score: number | null;
  source_url: string | null;
}

interface TonightResponse {
  total: number;
  telescope: Record<string, unknown>;
  targets: Target[];
}

export default function Home() {
  const [lat, setLat] = useState("42.6138");
  const [lon, setLon] = useState("-71.4889");
  const [limitingMag, setLimitingMag] = useState("19.5");
  const [minAlt, setMinAlt] = useState("20");
  const [results, setResults] = useState<TonightResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchTargets() {
    setLoading(true);
    setError(null);
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
                <TargetCard key={t.designation} target={t} />
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

function TargetCard({ target: t }: { target: Target }) {
  const priorityColor =
    (t.priority_score ?? 0) > 60
      ? "text-[var(--danger)]"
      : (t.priority_score ?? 0) > 30
      ? "text-[var(--warning)]"
      : "text-[var(--success)]";

  return (
    <div className="bg-[var(--bg-card)] border border-gray-700/50 rounded-xl p-5 hover:border-[var(--accent)]/30 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-lg font-semibold">
            {t.source_url ? (
              <a
                href={t.source_url}
                target="_blank"
                className="hover:text-[var(--accent)] transition-colors"
              >
                {t.designation}
              </a>
            ) : (
              t.designation
            )}
          </h3>
          <span className="text-xs text-[var(--text-secondary)] uppercase tracking-wider">
            {t.source}
          </span>
        </div>
        <div className={`text-2xl font-bold ${priorityColor}`}>
          {t.priority_score?.toFixed(0) ?? "—"}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-sm">
        <Stat label="Magnitude" value={t.mag_v?.toFixed(1) ?? "—"} />
        <Stat label="NEO Score" value={t.neo_score?.toFixed(0) ?? "—"} />
        <Stat
          label="Window"
          value={t.obs_window_hours ? `${t.obs_window_hours}h` : "—"}
        />
        <Stat
          label="Best Alt"
          value={t.best_altitude_deg ? `${t.best_altitude_deg}°` : "—"}
        />
        <Stat
          label="Airmass"
          value={t.best_airmass?.toFixed(2) ?? "—"}
        />
        <Stat
          label="Moon Sep"
          value={t.moon_sep_deg ? `${t.moon_sep_deg}°` : "—"}
        />
        <Stat
          label="Not Seen"
          value={`${t.not_seen_days.toFixed(1)}d`}
        />
        <Stat
          label="PHA Score"
          value={t.pha_score?.toFixed(0) ?? "—"}
        />
      </div>

      {t.obs_window_start && t.obs_window_end && (
        <div className="mt-3 text-xs text-[var(--text-secondary)]">
          Observable:{" "}
          {new Date(t.obs_window_start).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          –{" "}
          {new Date(t.obs_window_end).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          UTC
        </div>
      )}
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
