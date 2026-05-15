# Project Status

A snapshot of the platform as of the latest commit on `main`. Use this as the seed context for a fresh chat session or as a handoff to the next UROP.

---

## What this is

Wallace Observatory follow-up target platform. A class-based service that ingests astronomical alerts (NEOCP, JPL Scout, JPL Sentry, Fink LSST, Fink ZTF), filters for observability from a user's site, and exposes results through both a JSON REST API and a single-page web UI.

The platform is built so that adding a new target class (e.g. asteroid characterization, exoplanet transits) is one self-contained Python file, and adding a new data source is one utility function. Class metadata, filter schemas, and presets all flow through the API to the UI, so adding a class requires no router or frontend changes.

Repository: <https://github.com/JacksonHolland/neo-planner>
Backend deploy: Railway
Frontend deploy: (Vercel or wherever the user pointed it)

---

## Architecture

```
core/
  target.py            Target dataclass (every source produces these)
  position.py          extrapolate_to_now() — linear motion model
  observability.py     above-horizon + dark window + moon + HA/Az
  telescope.py         TelescopeProfile dataclass
classes/
  base.py              TargetClass + Preset dataclasses
  __init__.py          CLASSES registry + start_all()
  neo.py               Near-Earth Objects (NEOCP + Scout + Sentry + Fink LSST + Fink ZTF)
  supernova.py         Supernovae (Fink LSST + Fink ZTF)
sources/
  registry.py          slug -> {name, label, url} for sources and catalogs
  fink_lsst.py         start_fink_lsst_consumer() utility
  fink_ztf.py          start_fink_ztf_consumer() utility
  neocp.py             NEOCPAdapter (HTTP polling)
  scout.py             ScoutAdapter + enrich_targets()
  sentry.py            SentryAdapter + enrich_with_sentry()
api/
  main.py              FastAPI app + /health + startup hook
  models.py            Pydantic response models (TargetResponse, TargetsResponse, ClassResponse, SourceInfo, PresetResponse)
  config.py            HOST / PORT
  routers/classes.py   THE router. /classes, /classes/{name}, /classes/{name}/targets
frontend/src/
  app/layout.tsx       Galaxy background + MIT logo nav
  app/page.tsx         Single page: class dropdown, presets, filter form, results table
  app/docs/page.tsx    Auto-generated docs from /classes
  components/Galaxy.tsx (React Bits Galaxy, requires ogl)
```

### The class abstraction

```python
@dataclass
class TargetClass:
    name: str                        # url slug
    label: str
    description: str
    canonical_catalog: str           # "MPC" / "TNS" / "none"
    filter_model: type[BaseModel]    # Pydantic model — drives query params AND the UI form
    sources: list[str]               # adapter slugs (resolved to {name,label,url} via sources/registry.py)
    get_targets: Callable[[], list[Target]]
    apply_filters: Callable[[list[Target], BaseModel], list[Target]]
    presets: list[Preset]            # named filter combinations surfaced as one-click buttons
```

Nine fields, two callables. Each class module instantiates a `TargetClass` and registers in `CLASSES`.

---

## API

| Endpoint | What it does |
|---|---|
| `GET /classes` | List all classes with filter schemas, sources, presets. Drives the UI class picker. |
| `GET /classes/{name}` | Detail for one class. |
| `GET /classes/{name}/targets?lat=&lon=&...` | Observable, filtered, ranked targets. Includes diagnostic counts. |
| `GET /health` | Per-class cache size + source list. |
| `GET /docs`, `/redoc`, `/openapi.json` | FastAPI's auto-generated OpenAPI spec. |

### `TargetsResponse` diagnostics

Every targets response includes `cache_size`, `matched_filters`, `matched_observability`. The frontend uses these to explain WHY a query returned 0 results (cache empty? filters cut everything? observability cut everything?).

### Validation errors

HTTP 422 with a structured body:
```json
{ "detail": { "errors": [{ "field": "lat", "label": "Latitude (deg)", "message": "Field required" }] } }
```
Frontend renders each error inline below its input.

---

## Classes currently registered

### `neo` — Near-Earth Objects

- Canonical catalog: MPC.
- Sources: NEOCP (HTTP poll, 5 min), JPL Scout enrichment, JPL Sentry enrichment, Fink LSST (`fink_uniform_sample_lsst` with Julien's workaround filter), Fink ZTF (`fink_sso_fink_candidates_ztf`, `fink_sso_ztf_candidates_ztf`).
- Filters: standard observer/telescope params + `catalogued`, `max_age_hours` (default 72), `motion_rate_min`, `mag_h_max`, `n_targets`.
- Presets: "NEOCP follow-up", "Fresh unknowns", "Fast movers".

### `supernova` — Supernovae

- Canonical catalog: TNS.
- Sources: Fink LSST (`fink_sn_near_galaxy_candidate_lsst`), Fink ZTF (`fink_sn_candidates_ztf`).
- Filters: standard observer/telescope params + `catalogued`, `max_age_hours` (default 168), `n_targets`.
- Presets: "TNS classified", "Unclassified", "Bright only".

---

## Adding a new class

1. Create `classes/<name>.py`.
2. Define `class <Name>Filters(BaseModel)` with the filter fields. Each field uses `Field(..., title=..., description=...)` so the UI labels are human.
3. Module-level `_cache: list[Target]` and `_lock = threading.Lock()`.
4. Per-source ingestion handlers that produce `Target`s.
5. `apply_filters(targets, filters)`, `get_targets()`, `start()`.
6. `TARGET_CLASS = TargetClass(...)` and `CLASSES["<name>"] = TARGET_CLASS`.
7. Add `<name>.start()` to `classes/__init__.py:start_all()`.

That's it. UI, docs, and API auto-discover it.

---

## Adding a new source

For Kafka brokers similar to Fink, copy `sources/fink_lsst.py` and adjust the server/group_id env vars. For HTTP-polled sources, follow the NEOCP/Scout pattern. Register the slug in `sources/registry.py` with a human label and URL so it shows up nicely in the UI.

---

## Environment variables (Railway)

All have working defaults. Only set if overriding:

| Var | Default | Purpose |
|---|---|---|
| `HOST` | `0.0.0.0` | Bind address |
| `PORT` | `8000` | Bind port |
| `NEOCP_POLL_SECONDS` | `300` | NEOCP refresh cadence |
| `FINK_LSST_SERVER` | `kafka-lsst.fink-broker.org:24499` | Fink LSST Kafka |
| `FINK_LSST_GROUP_ID` | `jackson_mit` | LSST consumer group base; each consumer gets a unique suffix automatically |
| `FINK_ZTF_SERVER` | `kafka-ztf.fink-broker.org:24499` | Fink ZTF Kafka |
| `FINK_ZTF_GROUP_ID` | `jackson_mit` | ZTF consumer group base |
| `FINK_GROUP_ID` | (fallback for both above) | Shared default |
| `FINK_POLL_TIMEOUT` | `10` | Kafka poll timeout (seconds) |
| `NEO_FINK_LSST_TOPICS` | `fink_uniform_sample_lsst` | NEO class's LSST topics |
| `NEO_FINK_ZTF_TOPICS` | `fink_sso_fink_candidates_ztf,fink_sso_ztf_candidates_ztf` | NEO class's ZTF topics |
| `SUPERNOVA_FINK_LSST_TOPICS` | `fink_sn_near_galaxy_candidate_lsst` | SN class's LSST topics |
| `SUPERNOVA_FINK_ZTF_TOPICS` | `fink_sn_candidates_ztf` | SN class's ZTF topics |

Fink credentials are registered out-of-band via `fink_client_register` (no password — Fink uses passwordless SASL).

---

## Key implementation details and gotchas

- **Each Kafka consumer gets a unique `group_id`** by appending the consumer name to the base. This avoids partition-assignment collisions when multiple class threads share a Kafka cluster. Without this, the cache stays empty.
- **Positions are extrapolated to "now" at request time** using the motion vector. Users see both the extrapolated `ra_deg/dec_deg/epoch` and the raw `observed_at + motion_rate_arcsec_min + motion_pa_deg` so they can apply their own uncertainty model.
- **No background eviction.** The cache grows monotonically until restart. At current rates (single-digit MB/month per class) this is fine. `max_age_hours` is a request-time filter, not a memory-management feature.
- **No authentication, no rate limit.** Public read-only science data. CORS open. Be reasonable about poll cadence (1-5 min is appropriate).
- **Pydantic Field `title` is the user-facing label.** Every filter has explicit `title=` so the UI shows "Latitude (deg)" not "lat".
- **Sources are slugs, resolved to `{name, label, url}` via `sources/registry.py`.** Adding a new source means a new registry entry and a class module that uses it.

---

## Honest operational picture

### What works today

- **NEOCP + Scout + Sentry**: classic NEO follow-up workflow, always populated, southern-sky-heavy at current epoch.
- **Fink ZTF**: producing usable SSO and SN candidates nightly. Northern sky, mag 17-21, well-matched to Wallace.
- **Web UI**: responsive single-page app, Wallace defaults pre-filled, preset buttons, inline validation errors, empty-state explanations.
- **JSON API**: telescope automation can poll directly.

### What is sparse or limited

- **Fink LSST**: Rubin is in early operations with irregular observing cadence and no dedicated SSO filter at the Fink level yet. Volume will grow as Rubin ramps up. Our local workaround filter handles what we receive.
- **Same-night arc extension and orbit fitting**: not in scope. The platform delivers target lists; orbit fitting and MPC submission are the next downstream steps and happen in the observatory's existing tooling.

### Scope clarification (important for next handoff)

The original supervisor repo's framing of "Rubin → ephemeris" has a smaller useful window than initially expected: by the time a survey accumulates enough multi-night detections to fit an orbit, it has typically already submitted to MPC. The pre-MPC channel matters specifically for close-approach urgency, sky-coverage handoffs between southern Rubin and northern Wallace, and cadence-gap follow-up — but not as a routine workflow. The operational planetary-defense contribution mostly happens through NEOCP follow-up, which the platform supports natively (the `catalogued = true` filter or the "NEOCP follow-up" preset).

Both modes are first-class in the platform. Worth a focused conversation with supervisors before scaling up effort in one direction over the other.

---

## Open work for next UROP

In rough priority order:

1. **Submit an SSO filter PR to `fink-filters`.** Julien Peloton (Fink lead) is open to this. The ZTF SSO filter (`filter_sso_fink_candidates`) is a one-line filter on `pred.is_sso` — the LSST equivalent needs the science module that produces `pred.is_sso` to be wired in. This is the single biggest improvement to the data flow; once it lands, our workaround can be removed.
2. **MPC 80-column export helper.** When Wallace produces astrometry on a target, formatting it for MPC submission is a known transformation. A small endpoint that takes RA/Dec/time and outputs the 80-col line would save the observer a step.
3. **Orbit-fitting integration.** Find_Orb on the server, fed by Wallace astrometry + Rubin/ZTF discovery position, would let the platform produce its own ephemerides. This is what the original supervisor pitch implied — make sure that's still the right scope before investing.
4. **Asteroid characterization class.** When SNAPS exposes a public API (their April 2026 paper says soon), add it as a class for known-asteroid light curve work.
5. **Cache eviction on ingest.** Optional. Drop entries older than the class's longest reasonable `max_age_hours` after a cap is reached, to bound memory.

---

## Useful commands

Local development:
```bash
# Backend
pip install -r requirements.txt
uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload

# Frontend
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

Probe Kafka offsets for our consumer groups:
```python
from confluent_kafka import Consumer, TopicPartition
c = Consumer({"bootstrap.servers": "kafka-lsst.fink-broker.org:24499",
              "group.id": "jackson_mit", "enable.auto.commit": False})
md = c.list_topics("fink_uniform_sample_lsst", timeout=10).topics
# ...inspect watermarks and committed offsets
```

Quick smoke test of the deployed API:
```bash
curl https://your-railway-url/health
curl 'https://your-railway-url/classes/neo/targets?n_targets=5'
```

---

## Credentials and access

- **Fink credentials**: passwordless SASL, registered to `jackson` / `jackson_mit`. Stored in `~/.finkclient/{ztf,lsst}_credentials.yml` for local CLI use. For the deployed backend, env vars are the source of truth. Hand off the original Fink registration email (from Julien Peloton) so the next UROP doesn't have to re-apply.
- **Railway**: add the next UROP as an admin so they can adjust env vars and view deploys.
- **GitHub repo**: <https://github.com/JacksonHolland/neo-planner>. Make sure the next UROP has push access.

---

## Latest commit reference

`8e47520` — "Tell the user WHY there are 0 targets". Adds diagnostic counts to the targets response and contextual empty-state messages to the UI.
