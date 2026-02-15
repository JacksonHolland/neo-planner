# NEO Follow-Up Target Planner — Architecture

## Mission

An open-source platform that bridges the gap between **alert sources**
(MPC, JPL, Rubin brokers, ZTF, ATLAS, and any future survey) and
**follow-up telescopes** (professional observatories like MIT's Wallace,
research networks like Haystack, and citizen scientists with backyard
scopes).

The platform aggregates alerts from multiple sources, deduplicates them,
filters for observability from a given telescope, ranks by scientific
priority, and exports in the format the telescope needs.

**It is not tied to any single alert source or telescope.**

## Why this matters

Today, if you run a small observatory and want to do NEO follow-up, you
have to manually check the NEOCP, cross-reference Scout, calculate
whether objects are observable from your site, check brightness limits,
and convert formats. There is no unified, open tool that does this.

This platform answers one question: **"What should my telescope observe
tonight?"**

## Context

- **MIT Planetary Defense Network**: WAO + Haystack 37m + partner telescopes
- **Principal contacts**: Rich (faculty), Saverio (research scientist,
  planetary defense lead), Tim & Mike (Wallace staff)
- **Jackson's background**: Course 8, determined orbital parameters of
  NEOs using Wallace data (12.410)
- **First telescope**: Wallace Astrophysical Observatory (WAO), but the
  system generalizes to any observatory or citizen scientist

---

## Architecture Overview

```
  Alert Sources               Core Platform                  Outputs
  (pluggable)                 (source-agnostic)              (telescope-agnostic)
  ─────────────               ─────────────────              ────────────────────

  ┌─────────────┐
  │ MPC NEOCP   │──┐
  └─────────────┘  │
  ┌─────────────┐  │       ┌─────────────────────┐
  │ JPL Scout   │──┤       │                     │       ┌──────────────┐
  └─────────────┘  │       │   Ingestion Layer    │       │ REST API     │
  ┌─────────────┐  ├──────>│   (normalize)        │       │ (Railway)    │
  │ JPL Sentry  │──┤       │         │            │       └──────┬───────┘
  └─────────────┘  │       │   Deduplication      │              │
  ┌─────────────┐  │       │         │            │       ┌──────┴───────┐
  │ Fink        │──┤       │   Filter Engine      │──────>│ CLI Tool     │
  │ (Rubin/ZTF) │  │       │   (telescope profile │       │ (pip install)│
  └─────────────┘  │       │    as parameter)     │       └──────┬───────┘
  ┌─────────────┐  │       │         │            │              │
  │ ANTARES     │──┤       │   Priority Scorer    │       ┌──────┴───────┐
  └─────────────┘  │       │         │            │       │ Web UI       │
  ┌─────────────┐  │       │   Format Converter   │──────>│ (Vercel)     │
  │ ALeRCE      │──┘       │                     │       └──────────────┘
  └─────────────┘          └─────────────────────┘
  ┌─────────────┐
  │ Future:     │
  │ ATLAS, CSS, │──── (add new sources by writing an adapter)
  │ Lasair, ... │
  └─────────────┘
```

---

## Alert Sources (Input Layer)

Each alert source is a **plugin adapter** that normalizes raw data into
a common `Target` schema. Adding a new source means writing one adapter
class — the rest of the platform doesn't change.

### Common Target Schema

Every adapter produces objects in this normalized form:

```python
@dataclass
class Target:
    # Identity
    designation: str          # e.g., "ZTF10Bb" or "2025 HK53"
    source: str               # e.g., "neocp", "scout", "fink"
    source_url: str           # link back to original

    # Sky position (current / predicted)
    ra_deg: float             # right ascension, degrees
    dec_deg: float            # declination, degrees
    epoch: datetime           # when this position is valid

    # Brightness
    mag_v: float | None       # predicted visual magnitude
    mag_h: float | None       # absolute magnitude (size proxy)

    # Orbit quality
    n_obs: int                # observations so far
    arc_days: float           # observational arc length
    not_seen_days: float      # days since last observation

    # Scoring
    neo_score: float | None   # 0-100, probability of being a real NEO
    pha_score: float | None   # potentially hazardous asteroid score
    impact_prob: float | None # Earth impact probability (from Sentry)

    # Metadata
    updated_at: datetime
    raw: dict                 # original payload for debugging
```

### Source Adapters

#### Tier 1 — Ready now, no auth, proven APIs

| Source | URL | Data | Polling |
|--------|-----|------|---------|
| **MPC NEOCP** | `minorplanetcenter.net/Extended_Files/neocp.json` | ~50-100 unconfirmed NEO candidates | Every 5-15 min |
| **JPL Scout** | `ssd-api.jpl.nasa.gov/scout.api` | Same objects + hazard scoring | Every 15 min |
| **JPL Sentry** | `ssd-api.jpl.nasa.gov/sentry.api` | ~2,000 objects with impact probability | Every few hours |

These three sources are complementary:
- **NEOCP** = "here are objects that need follow-up"
- **Scout** = "here's how dangerous they are"
- **Sentry** = "here are objects with non-zero impact probability"

Cross-referencing them gives you a prioritized target list. All three
are free, unauthenticated JSON APIs tested and working in our codebase.

#### Tier 2 — Requires registration, adds Rubin/ZTF coverage

| Source | URL | Data | Access |
|--------|-----|------|--------|
| **Fink** | fink-portal.org | Rubin + ZTF alerts, solar system classification | `fink-client` (Kafka) or REST API, register with team |
| **ANTARES** | antares.noirlab.edu | Rubin + ZTF alerts, general classification | Web portal + API, register |
| **ALeRCE** | alerce.online | ZTF alerts, stamp classifier for asteroids | REST API at api.alerce.online, register |

These brokers add real-time detections from Rubin and ZTF that haven't
yet made it to the NEOCP. Fink has the best solar system classification.

The official Rubin community broker list (7 full-stream brokers):
ALeRCE, AMPEL, ANTARES, Babamul, Fink, Lasair, Pitt-Google.

#### Tier 3 — Additional surveys (future adapters)

| Source | What it adds |
|--------|-------------|
| **ATLAS** | All-sky survey, fast NEO discovery |
| **CSS/Catalina** | Long-running NEO survey |
| **Rubin RSP** (direct) | SSObject/SSSource catalog via TAP (needs auth token) |
| **b612 MPC exports** | Historical batch data (already built in current codebase) |

Adding any of these is just writing a new adapter that normalizes to
the `Target` schema.

---

## Filter Engine (Core Logic)

The filter engine is the heart of the platform. It takes a list of
`Target` objects and a `TelescopeProfile`, and returns a ranked list of
what to observe tonight.

### Telescope Profile

```json
{
  "name": "Wallace Astrophysical Observatory",
  "code": "244",
  "lat": 42.6138,
  "lon": -71.4889,
  "alt_m": 180,
  "aperture_m": 0.6,
  "limiting_mag": 19.5,
  "fov_arcmin": 20,
  "min_altitude_deg": 20,
  "max_sun_alt_deg": -12,
  "min_moon_sep_deg": 30
}
```

Any observatory or citizen scientist provides their own profile.
The rest of the system adapts automatically.

### Filter Pipeline

```
  Raw targets from all sources
          │
          ▼
  ┌──────────────────┐
  │ 1. Deduplicate    │  Same object from NEOCP + Scout + Fink
  │    (merge scores) │  → merge into single target with combined info
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │ 2. Brightness     │  Drop objects fainter than telescope's
  │    filter         │  limiting magnitude
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │ 3. Observability  │  Is it above min altitude tonight?
  │    calculator     │  Is it dark enough? Moon far enough?
  │                   │  What's the observable window?
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │ 4. Priority       │  Score by: urgency (not_seen_days),
  │    scorer         │  orbit uncertainty (arc), hazard score,
  │                   │  observable window length, user weights
  └────────┬─────────┘
           │
           ▼
  Ranked target list for tonight
```

### Filter Details

1. **Deduplication** — The same object often appears in NEOCP, Scout,
   and a broker alert under different designations. Match by position
   (cone search) and cross-reference designations. Merge scoring data
   from all sources into a single enriched target.

2. **Brightness filter** — Compare predicted magnitude against the
   telescope's `limiting_mag`. No point sending a mag 23 target to a
   telescope that can only see to mag 19.

3. **Observability calculator** — Given the telescope's lat/lon and the
   target's RA/Dec, compute:
   - Rise/set times and transit time
   - Altitude and airmass over the night
   - Observable window (when altitude > `min_altitude_deg` and sun
     below `max_sun_alt_deg`)
   - Moon separation (reject if too close)
   - Libraries: `astropy`, `astroplan`

4. **Priority scorer** — Rank targets by scientific value. Default
   scoring weights (user-configurable):
   - `not_seen_days` — more urgent if not observed recently
   - `arc_days` (inverse) — short arc = uncertain orbit = high value
   - `neo_score` — higher = more likely a real NEO
   - `pha_score` — potentially hazardous = high priority
   - `impact_prob` — non-zero impact probability = highest priority
   - `observable_hours` — prefer objects with longer windows tonight
   - Users can define custom weight profiles for their science goals

### Key Libraries

- `astropy` — coordinate transforms, time handling
- `astroplan` — observability calculations (altitude, airmass, moon)
- `astroquery` — query JPL Horizons for ephemerides if needed

---

## Output Layer

### 1. REST API (for telescope control systems and integrations)

Hosted on Railway. Endpoints:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/targets/tonight?lat=X&lon=Y&mag_limit=Z` | Tonight's ranked targets for a location |
| GET | `/targets/{designation}` | Detail + observability for one object |
| GET | `/targets/export?format=mpc80` | Export targets in MPC 80-col, ADES, CSV, JSON |
| GET | `/sources/neocp` | Raw NEOCP feed (cached, normalized) |
| GET | `/sources/scout` | Raw Scout feed (cached, normalized) |
| GET | `/sources/sentry` | Raw Sentry feed (cached, normalized) |
| POST | `/telescopes` | Register a telescope profile |
| GET | `/telescopes/{id}/tonight` | Tonight's targets for a registered telescope |
| GET | `/health` | System status, source freshness |

### 2. CLI Tool (for citizen scientists and scripting)

```bash
pip install neo-planner    # (working name)

# What should I observe tonight from my location?
neo-planner tonight --lat 42.6 --lon -71.5 --aperture 0.3 --mag-limit 18

# Export NEOCP targets brighter than mag 20 in MPC format
neo-planner export --format mpc80 --mag-max 20 --score-min 80

# Show details for a specific object
neo-planner target ZTF10Bb --lat 42.6 --lon -71.5
```

### 3. Web UI (Vercel, future)

Simple interface: enter your location + telescope specs, see tonight's
NEO targets on a sky map with priority scores and observable windows.

---

## What We've Already Built (v0)

The current codebase was built around b612 batch exports. Here's what
carries forward and what gets replaced:

| File | Purpose | Status |
|------|---------|--------|
| `explore.py` | Download + profile Rubin MPC data | Keep as dev tool |
| `sync_data.py` | Sync daily partitions from GCS | Keep for batch/historical use |
| `target_selector.py` | Filter for NEOs by designation | **Refactor** — replace designation matching with live source ingestion |
| `format_converter.py` | MPC 80-col, ADES PSV/XML, JSON | **Keep as-is** — directly reusable |
| `api/` | FastAPI backend | **Refactor** — new routes, same skeleton |
| `api/models.py` | Pydantic schemas | **Refactor** — update to new Target schema |
| `api/config.py` | Settings | **Keep** |
| `Dockerfile`, `railway.toml` | Deployment | **Keep as-is** |

### New modules to build

| Module | Purpose |
|--------|---------|
| `sources/` | Adapter plugins for each alert source |
| `sources/neocp.py` | NEOCP adapter (poll + normalize) |
| `sources/scout.py` | Scout adapter (poll + normalize) |
| `sources/sentry.py` | Sentry adapter (poll + normalize) |
| `sources/fink.py` | Fink broker adapter (future) |
| `core/target.py` | Common Target dataclass |
| `core/telescope.py` | TelescopeProfile dataclass |
| `core/dedup.py` | Cross-source deduplication |
| `core/observability.py` | Observability calculator (astropy/astroplan) |
| `core/scorer.py` | Priority scoring engine |
| `api/routers/targets.py` | New target endpoints (tonight, export, detail) |
| `api/routers/sources.py` | Raw source feed endpoints |

---

## Development Phases

### Phase 1 — Source adapters + common schema
Build NEOCP, Scout, and Sentry adapters. Define the common Target
schema. Verify we can poll all three and normalize into the same format.
All three are free, no auth, already tested.

### Phase 2 — Observability engine
Build the observability calculator using astropy/astroplan. Given a
TelescopeProfile and a Target, compute tonight's observable window.
This is where the physics lives.

### Phase 3 — Deduplication + priority scoring
Cross-reference targets across sources. Score and rank by urgency,
orbit uncertainty, hazard level, and observable window.

### Phase 4 — API
Refactor FastAPI backend for the new architecture. Key endpoint:
`GET /targets/tonight?lat=X&lon=Y&mag_limit=Z` returns ranked targets.

### Phase 5 — Format export
Wire up the existing format converter (MPC 80-col, ADES XML/PSV) to
the new target pipeline. Add any WAO-specific export formats.

### Phase 6 — CLI tool
pip-installable CLI that wraps the core logic. No server needed —
runs locally, pulls from sources directly.

### Phase 7 — Web UI
Vercel frontend. Sky map, target list, observable window visualization.

### Phase 8 — Broker integration
Add Fink, ANTARES, ALeRCE adapters for real-time Rubin/ZTF alerts.
These are additive — the rest of the platform doesn't change.

---

## Open Questions (for meeting with Rich, Saverio, Tim, Mike)

1. What is WAO's limiting magnitude? (Determines brightness cutoff)
2. What format does WAO's telescope control system accept for pointing?
3. What is the desired latency? (Minutes? Hours? Next-day?)
4. Should we prioritize NEOCP follow-up or new Rubin discoveries?
5. What's the submission format for sending WAO observations back to MPC?
6. Does MIT have existing Rubin data rights or broker access?
7. Is there an existing WAO observation planning workflow to integrate with?
8. Are there other telescopes in the Planetary Defense Network to
   onboard as additional telescope profiles?
9. What are the priority scoring weights that make sense for WAO's
   science goals? (e.g., favor short-arc objects? favor PHAs?)
