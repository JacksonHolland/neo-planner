# Follow-up Target Platform — Architecture

## What it is

A class-first follow-up target service. Users pick a target class (NEO,
Supernova, …), filter by their location and telescope, and get a list of
observable targets with source attribution and catalog status. The same
shape is served by the REST API and the web UI; telescope automation can
poll the API directly.

It is not tied to any single alert source or telescope. Adding a new class
is one self-contained file under `classes/`. Adding a new data source is
a utility function under `sources/` that any class can use.

## High-level flow

```
[Source utilities]            [Class modules]           [API]              [UI]
sources/fink_lsst.py   ─┐
sources/fink_ztf.py    ─┤
sources/neocp.py       ─┼──>  classes/neo.py        ─┐
sources/scout.py       ─┘     classes/supernova.py  ─┼──>  /classes        web page
sources/sentry.py             …                      │     /classes/{n}    docs page
                                                     │     /classes/{n}/targets
                                                     │     /health
```

Each class module:

1. Defines its filter Pydantic model (the API and UI both use this schema).
2. Owns a thread-safe in-memory cache of `Target`s.
3. Launches background ingestion threads (Kafka consumers, NEOCP poller, etc.).
4. Tags every cached target with `target_class`, `catalogued`, `catalog_match`.
5. Implements its own `apply_filters(targets, filters)`.
6. Registers itself in `classes.CLASSES`.

The API endpoint reads the cache, applies the class's filters, runs the
generic observability engine, linearly extrapolates moving-object positions
to "now", and returns the top N.

## Project layout

```
core/
  target.py            Target dataclass
  position.py          extrapolate_to_now() linear motion extrapolation
  observability.py     above-horizon / dark / moon / HA / Az / altitude filter
  telescope.py         TelescopeProfile dataclass
classes/
  base.py              TargetClass dataclass
  __init__.py          CLASSES registry + start_all()
  neo.py               Near-Earth Objects (one file: filters + cache + handlers)
  supernova.py         Supernovae (same shape)
sources/
  fink_lsst.py         start_fink_lsst_consumer() utility
  fink_ztf.py          start_fink_ztf_consumer() utility
  neocp.py             NEOCPAdapter (HTTP polling)
  scout.py             ScoutAdapter + enrich_targets()
  sentry.py            SentryAdapter + enrich_with_sentry()
api/
  main.py              FastAPI app, /health, /, startup hook
  models.py            TargetResponse, TargetsResponse, ClassResponse
  config.py            HOST / PORT
  routers/classes.py   /classes router (the only one)
frontend/src/
  app/layout.tsx       Galaxy background + minimal nav
  app/page.tsx         Single page: class picker, filter form, results table
  app/docs/page.tsx    Auto-generated from /classes
  components/Galaxy.tsx  React Bits Galaxy (WebGL via ogl)
```

## The class abstraction

```python
@dataclass
class TargetClass:
    name: str                            # url slug, e.g. "neo"
    label: str
    description: str                     # surfaced in /classes and the docs page
    canonical_catalog: str               # "MPC", "TNS", "none"
    filter_model: type[BaseModel]        # Pydantic model for query params
    sources: list[str]                   # adapter names for transparency
    get_targets: Callable[[], list[Target]]
    apply_filters: Callable[[list[Target], BaseModel], list[Target]]
```

Eight fields, two callables. Anything more would be fluff.

## API

| Endpoint | Returns |
|---|---|
| `GET /classes` | All registered classes including their filter JSON schemas |
| `GET /classes/{name}` | One class with the full filter schema |
| `GET /classes/{name}/targets?lat=&lon=&…` | Observable targets for that class |
| `GET /health` | Per-class cache counts |

All filter fields are class-defined. The endpoint introspects the class's
Pydantic `filter_model` to validate query params; the UI introspects
`filters_schema` (from `model_json_schema()`) to render the form. One source
of truth.

## Positions

Each target carries its best current position (`ra_deg`, `dec_deg`, `epoch`)
plus the original measurement time (`observed_at`) and motion vector
(`motion_rate_arcsec_min`, `motion_pa_deg`) when known.

At request time, `core.position.extrapolate_to_now()` updates `ra_deg`/
`dec_deg`/`epoch` for moving targets using simple linear extrapolation. The
observer sees both the extrapolated position and the inputs that produced
it, so they can apply their own uncertainty model.

There is no quantitative position warning. There are no background sweepers.

## Adding a new class

Create one file: `classes/<name>.py`. Pattern:

1. `class <Name>Filters(BaseModel)` — the filter schema.
2. `_cache: list[Target] = []`, `_lock = threading.Lock()`.
3. Per-source `_on_<source>_alert(alert) -> Optional[Target]` handlers.
4. `apply_filters(targets, filters) -> list[Target]`.
5. `get_targets() -> list[Target]`.
6. `start()` — spin up ingestion threads.
7. `TARGET_CLASS = TargetClass(...)` and `CLASSES[name] = TARGET_CLASS`.
8. Add `<name>.start()` to `classes/__init__.py:start_all()`.

That's it. No router changes, no UI changes, no schema changes. The UI and
docs auto-discover the new class from `/classes`.

## Deployment

Single FastAPI process. Each class's ingestion threads (and one daemon per
Fink consumer) live inside the same process. Memory: a few MB per class
under current alert rates. Restart drops the cache (Fink re-emits on
reconnect; NEOCP refresh repopulates within 5 minutes).

Env vars (all optional with sensible defaults):

- `HOST`, `PORT`
- `NEOCP_POLL_SECONDS` (default 300)
- `FINK_LSST_SERVER`, `FINK_LSST_GROUP_ID`
- `FINK_ZTF_SERVER`, `FINK_ZTF_GROUP_ID`
- `FINK_POLL_TIMEOUT`
- `NEO_FINK_LSST_TOPICS`, `NEO_FINK_ZTF_TOPICS`
- `SUPERNOVA_FINK_LSST_TOPICS`, `SUPERNOVA_FINK_ZTF_TOPICS`
