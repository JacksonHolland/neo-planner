"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const sections = [
  { id: "data-sources", label: "Data Sources" },
  { id: "observability", label: "Observability Calculation" },
  { id: "streaking", label: "Streaking / Trailing" },
  { id: "fields", label: "Target Fields Explained" },
  { id: "limitations", label: "Limitations" },
  { id: "api-overview", label: "API Overview" },
  { id: "api-tonight", label: "GET /targets/tonight" },
  { id: "api-all", label: "GET /targets/all" },
  { id: "api-detail", label: "GET /targets/{designation}" },
  { id: "api-export", label: "GET /targets/export" },
  { id: "api-finder", label: "GET /targets/{desig}/finder" },
  { id: "api-sources", label: "GET /sources/neocp" },
  { id: "api-health", label: "GET /health" },
  { id: "response-schema", label: "Response Schema" },
];

export default function DocsPage() {
  const [active, setActive] = useState("data-sources");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
          }
        }
      },
      { rootMargin: "-20% 0px -60% 0px" }
    );
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 flex gap-10">
      {/* Sidebar */}
      <nav className="hidden lg:block w-56 shrink-0">
        <div className="sticky top-8 space-y-1">
          <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
            How It Works
          </div>
          {sections.slice(0, 5).map((s) => (
            <SidebarLink key={s.id} id={s.id} label={s.label} active={active === s.id} />
          ))}
          <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mt-6 mb-3">
            API Reference
          </div>
          {sections.slice(5).map((s) => (
            <SidebarLink key={s.id} id={s.id} label={s.label} active={active === s.id} />
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="min-w-0 max-w-3xl">
        <Link
          href="/"
          className="text-sm text-[var(--accent)] hover:underline mb-6 inline-block"
        >
          ← Back to Target Planner
        </Link>

        <h1 className="text-3xl font-bold mb-2">Documentation</h1>
        <p className="text-[var(--text-secondary)] mb-10">
          How the NEO Target Planner works, and how to use the API to build
          automated follow-up pipelines for your telescope.
        </p>

        {/* ── HOW IT WORKS ─────────────────────────────────────── */}

        <Section id="data-sources" title="Data Sources">
          <p>
            The platform aggregates NEO candidates from three public sources, polled
            every <strong>5 minutes</strong>:
          </p>

          <h4 className="font-semibold mt-4 mb-1">MPC NEO Confirmation Page (NEOCP)</h4>
          <p>
            The{" "}
            <a href="https://www.minorplanetcenter.net/iau/NEO/toconfirm_tabular.html" target="_blank" className="text-[var(--accent)] hover:underline">
              NEOCP
            </a>{" "}
            is maintained by the Minor Planet Center. It is a curated list of
            objects that have been detected by observatories worldwide and are
            suspected to be near-Earth objects, but have <strong>not yet been
            confirmed</strong>. Think of it as a to-do list: the MPC is asking
            other observatories to observe these objects so their orbits can be
            determined.
          </p>
          <p className="mt-2">
            At any given time, there are typically <strong>50–100 objects</strong> on the NEOCP.
            Objects are added when a new candidate is reported and removed once
            enough follow-up observations confirm (or rule out) the object.
            The list churns constantly — objects may stay for hours to days.
          </p>
          <p className="mt-2">
            Endpoint:{" "}
            <Code>https://minorplanetcenter.net/Extended_Files/neocp.json</Code>
          </p>

          <h4 className="font-semibold mt-4 mb-1">JPL Scout</h4>
          <p>
            <a href="https://cneos.jpl.nasa.gov/scout/" target="_blank" className="text-[var(--accent)] hover:underline">
              Scout
            </a>{" "}
            is NASA/JPL&apos;s automated hazard assessment system. It evaluates
            each NEOCP object and assigns it a <strong>neoScore</strong> (0–100,
            probability of being a real NEO) and a <strong>phaScore</strong> (potentially
            hazardous asteroid score). We cross-reference each NEOCP target with
            Scout data to enrich it with these hazard scores.
          </p>
          <p className="mt-2">
            Endpoint:{" "}
            <Code>https://ssd-api.jpl.nasa.gov/scout.api</Code>
          </p>

          <h4 className="font-semibold mt-4 mb-1">JPL Sentry</h4>
          <p>
            <a href="https://cneos.jpl.nasa.gov/sentry/" target="_blank" className="text-[var(--accent)] hover:underline">
              Sentry
            </a>{" "}
            tracks ~2,000 objects with non-zero Earth impact probability. We
            cross-reference NEOCP targets against the Sentry risk list. If a
            match is found, the target&apos;s <Code>impact_prob</Code> field is
            populated with the cumulative impact probability.
          </p>
          <p className="mt-2">
            Endpoint:{" "}
            <Code>https://ssd-api.jpl.nasa.gov/sentry.api</Code>
          </p>

          <h4 className="font-semibold mt-4 mb-1">Refresh cycle</h4>
          <p>
            On startup, the API fetches from all three sources and merges the
            results. A background thread then re-fetches every 5 minutes. The
            in-memory cache is replaced entirely on each refresh, so the data is
            always a live snapshot of the current NEOCP.
          </p>
        </Section>

        <Section id="observability" title="Observability Calculation">
          <p>
            When you provide your telescope&apos;s location and specs, the backend
            computes whether each target is observable from your site tonight. Here
            is the exact procedure:
          </p>

          <h4 className="font-semibold mt-4 mb-1">1. Dark window</h4>
          <p>
            We scan the Sun&apos;s altitude from your location in 15-minute steps
            across a 24-hour period. The <strong>dark window</strong> is the
            contiguous block where the Sun is below your{" "}
            <Code>max_sun_alt</Code> threshold (default: <strong>−12°</strong>,
            which corresponds to nautical twilight). If the Sun never goes below
            this threshold (e.g., polar summer), no targets are observable.
          </p>

          <h4 className="font-semibold mt-4 mb-1">2. Altitude scan</h4>
          <p>
            For each target, we compute its altitude above the horizon from your
            location in <strong>10-minute steps</strong> across the dark window
            using{" "}
            <a href="https://www.astropy.org/" target="_blank" className="text-[var(--accent)] hover:underline">
              astropy
            </a>
            &apos;s coordinate transformation engine (ICRS → AltAz). The target
            must be above your <Code>min_altitude</Code> (default:{" "}
            <strong>20°</strong>) at some point during the dark window to be
            considered observable.
          </p>

          <h4 className="font-semibold mt-4 mb-1">3. Observable window</h4>
          <p>
            The observable window is the time range during which the target is
            simultaneously above the minimum altitude, within hour-angle and
            azimuth limits, and the sky is dark. We report the start time, end
            time, and duration in hours.
          </p>

          <h4 className="font-semibold mt-4 mb-1">4. Moon separation</h4>
          <p>
            We compute the angular distance between the target and the Moon at
            the midpoint of the dark window. If this is less than your{" "}
            <Code>min_moon_sep</Code> (default: <strong>30°</strong>), the
            target is rejected. Observing near the Moon is difficult because
            scattered moonlight raises the sky background, making faint objects
            harder to detect.
          </p>

          <h4 className="font-semibold mt-4 mb-1">5. Brightness filter</h4>
          <p>
            The target&apos;s predicted apparent magnitude (from the NEOCP) is compared
            against your telescope&apos;s <Code>limiting_mag</Code>. Objects fainter
            than your limit are removed. Note: magnitude is an inverse scale —
            larger numbers are fainter (mag 19 is fainter than mag 15).
          </p>

          <h4 className="font-semibold mt-4 mb-1">6. Airmass</h4>
          <p>
            Airmass measures how much atmosphere light passes through to reach
            your telescope. At the zenith (directly overhead) airmass = 1.0. At
            lower altitudes it increases — at 30° altitude it&apos;s about 2.0, and
            at 20° it&apos;s about 2.9. Lower airmass means less atmospheric
            distortion and absorption, so observations are higher quality. We
            report the best (minimum) airmass achieved during the observable window.
            Calculated using the Pickering (2002) formula.
          </p>

          <h4 className="font-semibold mt-4 mb-1">7. Hour angle and azimuth</h4>
          <p>
            Many telescopes have physical pointing limits (pier flip boundaries,
            dome obstructions). We compute the target&apos;s hour angle (HA = LST − RA)
            and azimuth at each time step. Time steps where HA falls outside
            your <Code>min_ha_hours</Code> / <Code>max_ha_hours</Code> range, or
            azimuth falls outside <Code>min_az_deg</Code> / <Code>max_az_deg</Code>,
            are excluded from the observable window. By default these are
            unconstrained (HA: −6 to +6 h, Az: 0–360°).
          </p>

          <h4 className="font-semibold mt-4 mb-1">8. Transit</h4>
          <p>
            The transit time is when the target reaches its highest altitude
            (lowest airmass). This is the optimal moment to observe.
          </p>
        </Section>

        <Section id="streaking" title="Streaking / Trailing">
          <p>
            Near-Earth objects move across the sky, so during a long exposure the
            object traces a line (a <strong>trail</strong>) rather than appearing
            as a point source. Excessive trailing degrades both astrometric
            centroid accuracy and photometric signal-to-noise ratio (SNR).
          </p>

          <h4 className="font-semibold mt-4 mb-1">Maximum exposure formula</h4>
          <p>
            The maximum exposure time before the trail exceeds an acceptable length
            is:
          </p>
          <CodeBlock>{`t_max = L_max / ω

where:
  t_max  = maximum exposure time (seconds)
  L_max  = maximum acceptable trail length (arcseconds)
  ω      = angular motion rate of the object (arcseconds / second)`}</CodeBlock>

          <h4 className="font-semibold mt-4 mb-1">Seeing-limited criterion</h4>
          <p>
            Trailing does not meaningfully degrade astrometric centroiding until the
            trail length exceeds the atmospheric seeing disk (the FWHM of the point
            spread function). When the trail is shorter than the seeing FWHM, the
            centroid measurement is dominated by atmospheric blur, not by the
            object&apos;s motion. Therefore the default maximum trail length is set
            to the seeing FWHM (typically 1.5–3 arcseconds).
          </p>
          <p className="mt-2">
            The user can adjust this via the <strong>Max Trail</strong> slider. A
            larger value allows longer exposures (useful for faint targets), while
            a smaller value preserves point-source morphology (important for
            precise photometry).
          </p>

          <h4 className="font-semibold mt-4 mb-1">SNR impact of trailing</h4>
          <p>
            A trailed source spreads its signal over more pixels, increasing the
            noise contribution from sky background and read noise. For
            background-limited observations, the first-order SNR penalty is:
          </p>
          <CodeBlock>{`SNR_trailed / SNR_point ≈ sqrt( FWHM / (FWHM + trail_length) )`}</CodeBlock>
          <p className="mt-2">
            This follows from the effective PSF area growing from FWHM&sup2; to
            FWHM &times; (FWHM + trail). A trail equal to the seeing FWHM costs
            approximately 30% in SNR. Trails up to 2–3&times; the FWHM are still
            routinely measured with modern centroiding and trail-fitting
            techniques. For a more precise empirical model, see Jones (2017)
            SMTN-003, which provides fitted coefficients for both SNR and
            detection losses as a function of velocity, exposure time, and
            seeing.
          </p>

          <h4 className="font-semibold mt-4 mb-1">Filtering</h4>
          <p>
            Targets whose computed <Code>max_exposure_sec</Code> falls below 1
            second are automatically removed from the results, as they are
            effectively too fast to image with a standard CCD exposure. This
            threshold is conservative — most telescope control systems cannot
            reliably execute sub-second exposures.
          </p>

          <h4 className="font-semibold mt-4 mb-1">References</h4>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li>
              Laurie, S. (2002). &ldquo;Astrometry of Near Earth Objects.&rdquo;{" "}
              <em>The Astronomer</em>. — States the optimal exposure rule:{" "}
              <em>&ldquo;The optimal exposure can be calculated by dividing the
              typical FWHM of a star image by the rate of motion of an
              object.&rdquo;</em>{" "}
              Available via the{" "}
              <a href="https://britastro.org/asteroids/Astrometry%20of%20NEO's%20-%20Stephen%20Laurie.htm" target="_blank" className="text-[var(--accent)] hover:underline">
                BAA Asteroids &amp; Remote Planets Section
              </a>.
            </li>
            <li>
              Jones, L. (2017). &ldquo;Trailing Losses for Moving Objects.&rdquo;{" "}
              LSST Technical Note{" "}
              <a href="https://smtn-003.lsst.io/" target="_blank" className="text-[var(--accent)] hover:underline">
                SMTN-003
              </a>. — Derives the detailed trailing-loss model with SNR and
              detection loss as a function of{" "}
              <Code>x = velocity &times; t_exp / seeing / 24</Code>,
              including fitted coefficients for magnitude losses.
            </li>
            <li>
              Vere&scaron;, P. et al. (2017). &ldquo;Statistical analysis of
              astrometric errors for the most productive asteroid
              surveys.&rdquo; <em>Icarus</em>, 296, 139–149. — Examines how
              astrometric errors grow with rate of motion, providing empirical
              validation that fast-moving objects have degraded positional
              accuracy.
            </li>
          </ul>
        </Section>

        <Section id="fields" title="Target Fields Explained">
          <FieldTable
            fields={[
              ["Designation", "Temporary name assigned by the reporting observatory or MPC (e.g., \"ZTF10Bb\", \"C45UKP1\"). Not a permanent asteroid number."],
              ["RA (Right Ascension)", "Celestial longitude, measured in hours-minutes-seconds (0h to 24h) or degrees (0° to 360°). Combined with Dec, this tells you where to point your telescope."],
              ["Dec (Declination)", "Celestial latitude, measured in degrees-arcminutes-arcseconds (−90° to +90°). Positive is north of the celestial equator."],
              ["Apparent Magnitude (V)", "How bright the object appears from Earth right now. The magnitude scale is logarithmic and inverted: mag 15 is bright (easy), mag 20 is very faint (hard). Each +1 magnitude is 2.5× fainter. Naked eye limit is about mag 6. A 0.6m telescope reaches ~mag 19–20."],
              ["Absolute Magnitude (H)", "How bright the object would appear at a standard distance (1 AU from both Sun and Earth). This is a proxy for physical size: H=22 ≈ 150m diameter, H=26 ≈ 25m, H=30 ≈ 4m."],
              ["Observable Window", "The time range during which the target is above your minimum altitude, within HA/azimuth limits, and the sky is dark. Reported in UTC."],
              ["Duration", "Length of the observable window in hours."],
              ["Transit Time", "When the target reaches its highest point in the sky — the ideal observation time."],
              ["Best Altitude", "The maximum altitude (degrees above horizon) the target reaches during the observable window. Higher is better."],
              ["Airmass", "Atmospheric path length relative to zenith. 1.0 = overhead (best). 2.0 = 30° altitude. <2.0 is generally good for photometry."],
              ["Best Azimuth", "The azimuth (degrees, 0°=N, 90°=E, 180°=S, 270°=W) at the target's best altitude during the observable window."],
              ["Hour Angle", "The hour angle at the target's best altitude. Negative = east of meridian (rising), positive = west (setting). Constrained by the telescope's min_ha_hours/max_ha_hours limits."],
              ["Moon Separation", "Angular distance from the Moon in degrees. Larger is better. Below ~30° the sky background from moonlight degrades observations."],
              ["Observations", "Number of observations reported to the MPC so far. Objects with very few observations (2–4) have the most uncertain orbits."],
              ["Arc Length", "Time span between the first and last observation, in days. A short arc (< 1 day) means the orbit is poorly constrained — these objects are high-value follow-up targets because additional observations dramatically improve the orbit."],
              ["Last Observed", "Days since the most recent observation. Objects not seen for several days are more urgent — they may be lost if not observed soon."],
              ["NEO Confidence", "JPL Scout's estimate (0–100%) that this object is a real near-Earth object rather than a main-belt asteroid or artifact."],
              ["PHA Score", "JPL Scout's assessment of whether the object could be a Potentially Hazardous Asteroid (close approach + large size). Higher = more potentially hazardous."],
              ["Impact Probability", "From JPL Sentry — the cumulative probability of Earth impact across all potential future close approaches. Only shown for objects on the Sentry risk list (~2,000 known objects). Displayed in scientific notation (e.g., 2.6e-07)."],
              ["Motion Rate", "How fast the object is moving across the sky, in arcseconds per minute. Computed from JPL Horizons RA_rate and DEC_rate at the predicted observation time. Falls back to JPL Scout's rate field if Horizons is unavailable. Important for exposure planning — fast-moving objects will trail in long exposures."],
              ["Motion Direction", "The position angle (PA) of the object's motion, measured in degrees from north through east (standard astronomical convention). Computed from JPL Horizons RA_rate and DEC_rate. Also shown as a cardinal direction (N, NE, E, etc.) and as an arrow on the finder chart."],
              ["Max Exposure", "The longest exposure before the object trails beyond the configured max trail length (default: seeing FWHM). Computed server-side as max_trail_arcsec / (motion_rate / 60). Targets with max exposure below 1 second are filtered out. See the Streaking / Trailing section for details."],
              ["Predicted Position", "If available from JPL Horizons, the predicted RA/Dec at the transit time. More accurate than the NEOCP position for fast-moving objects. Falls back to NEOCP position for objects not yet in Horizons."],
              ["Finder Chart", "An SVG star chart showing the target's position relative to nearby catalog stars. 15' field of view, N up, E left (standard astronomical orientation). Target is marked with crosshairs. If motion data is available, a dashed amber arrow shows the direction and rate of motion (scaled to 10 minutes of travel)."],
            ]}
          />
        </Section>

        <Section id="limitations" title="Limitations">
          <ul className="list-disc list-inside space-y-2">
            <li>
              <strong>NEOCP positions are current-epoch.</strong> The initial
              RA/Dec from the NEOCP is where the object was when last reported.
              For observable targets, the system queries JPL Horizons for a
              predicted position at transit time, shown as &ldquo;Predicted
              Position&rdquo; in the target detail. If Horizons does not have
              the object (common for very new candidates), only the NEOCP
              position is available.
            </li>
            <li>
              <strong>No orbital elements.</strong> The NEOCP provides positions
              and brightness, not orbital parameters (a, e, i, etc.). Orbital
              elements become available once the object is confirmed.
            </li>
            <li>
              <strong>5-minute polling lag.</strong> The NEOCP and Scout data are
              refreshed every 5 minutes. A newly posted object may take up to 5
              minutes to appear in our system.
            </li>
            <li>
              <strong>Single-source for now.</strong> Currently we only ingest
              from MPC NEOCP (enriched with Scout). The architecture supports
              adding more sources (Rubin alert brokers, ATLAS, Sentry impact
              risk list) as plug-in adapters.
            </li>
          </ul>
        </Section>

        {/* ── API REFERENCE ────────────────────────────────────── */}

        <div className="border-t border-gray-700 mt-12 pt-8 mb-8">
          <h2 className="text-2xl font-bold">API Reference</h2>
        </div>

        <Section id="api-overview" title="Overview">
          <p>
            The API is public and requires <strong>no authentication</strong>.
            All responses are JSON. CORS is enabled for all origins.
          </p>
          <p className="mt-2">
            Base URL:{" "}
            <Code>https://neo-planner-production.up.railway.app</Code>
          </p>
          <p className="mt-2">
            Interactive Swagger docs are available at{" "}
            <Code>/docs</Code> on the API server.
          </p>
        </Section>

        <Endpoint
          id="api-tonight"
          method="GET"
          path="/targets/tonight"
          description="Returns tonight's observable NEO targets ranked by priority for a given location and telescope."
          params={[
            ["lat", "float", "required", "Latitude in degrees (north positive)"],
            ["lon", "float", "required", "Longitude in degrees (east positive)"],
            ["alt_m", "float", "0", "Altitude above sea level in metres"],
            ["limiting_mag", "float", "18.0", "Faintest detectable magnitude"],
            ["min_altitude_deg", "float", "20.0", "Minimum target altitude above horizon"],
            ["min_moon_sep_deg", "float", "30.0", "Minimum angular distance from Moon"],
            ["min_ha_hours", "float", "-6.0", "Western hour-angle limit (hours)"],
            ["max_ha_hours", "float", "6.0", "Eastern hour-angle limit (hours)"],
            ["min_az_deg", "float", "0.0", "Minimum azimuth (degrees)"],
            ["max_az_deg", "float", "360.0", "Maximum azimuth (degrees)"],
            ["plate_scale_arcsec", "float", "2.0", "Plate scale (arcsec/pixel)"],
            ["seeing_arcsec", "float", "2.5", "Seeing FWHM (arcsec)"],
            ["max_trail_arcsec", "float", "2.5", "Max acceptable trail length (arcsec)"],
            ["limit", "int", "50", "Maximum number of targets to return"],
          ]}
          example={`curl "https://neo-planner-production.up.railway.app/targets/tonight?lat=42.6&lon=-71.5&limiting_mag=19.5"`}
        />

        <Endpoint
          id="api-all"
          method="GET"
          path="/targets/all"
          description="Returns all cached targets without observability filtering. Useful for seeing everything currently on the NEOCP."
          params={[
            ["limit", "int", "100", "Maximum number of targets to return"],
          ]}
          example={`curl "https://neo-planner-production.up.railway.app/targets/all?limit=10"`}
        />

        <Endpoint
          id="api-detail"
          method="GET"
          path="/targets/{designation}"
          description="Returns detail for a single target by its temporary designation. If lat/lon are provided, includes observability from that location."
          params={[
            ["designation", "string (path)", "required", "Target designation (e.g., C45UKP1)"],
            ["lat", "float", "optional", "Latitude for observability calculation"],
            ["lon", "float", "optional", "Longitude for observability calculation"],
            ["limiting_mag", "float", "18.0", "Limiting magnitude"],
          ]}
          example={`curl "https://neo-planner-production.up.railway.app/targets/C45UKP1?lat=42.6&lon=-71.5"`}
        />

        <Endpoint
          id="api-export"
          method="GET"
          path="/targets/export"
          description="Exports tonight's observable targets in various formats for telescope control systems or MPC submission."
          params={[
            ["format", "string", "json", "Export format: mpc80, ades-psv, ades-xml, json, csv"],
            ["lat", "float", "required", "Latitude"],
            ["lon", "float", "required", "Longitude"],
            ["alt_m", "float", "0", "Altitude (metres)"],
            ["limiting_mag", "float", "18.0", "Limiting magnitude"],
            ["min_altitude_deg", "float", "20.0", "Minimum altitude"],
            ["min_moon_sep_deg", "float", "30.0", "Minimum Moon separation"],
            ["min_ha_hours", "float", "-6.0", "Western hour-angle limit"],
            ["max_ha_hours", "float", "6.0", "Eastern hour-angle limit"],
            ["min_az_deg", "float", "0.0", "Minimum azimuth"],
            ["max_az_deg", "float", "360.0", "Maximum azimuth"],
            ["plate_scale_arcsec", "float", "2.0", "Plate scale (arcsec/pixel)"],
            ["seeing_arcsec", "float", "2.5", "Seeing FWHM (arcsec)"],
            ["max_trail_arcsec", "float", "2.5", "Max acceptable trail (arcsec)"],
            ["limit", "int", "200", "Maximum targets"],
          ]}
          example={`curl "https://neo-planner-production.up.railway.app/targets/export?format=mpc80&lat=42.6&lon=-71.5&limiting_mag=19.5"`}
        />

        <Endpoint
          id="api-finder"
          method="GET"
          path="/targets/{designation}/finder"
          description="Generates an SVG finder chart showing the target's position relative to nearby catalog stars. If the target has motion data, includes a direction arrow scaled to 10 minutes of motion. Returns image/svg+xml content."
          params={[
            ["designation", "string (path)", "required", "Target designation"],
            ["fov", "float", "15", "Field of view in arcminutes"],
            ["mag_limit", "float", "15", "Faintest catalog stars to include"],
          ]}
          example={`curl "https://neo-planner-production.up.railway.app/targets/C45UKP1/finder?fov=15" -o finder.svg`}
        />

        <Endpoint
          id="api-sources"
          method="GET"
          path="/sources/neocp"
          description="Returns the raw cached NEOCP feed — all candidates, no observability filtering applied."
          params={[]}
          example={`curl "https://neo-planner-production.up.railway.app/sources/neocp"`}
        />

        <Endpoint
          id="api-health"
          method="GET"
          path="/health"
          description="System health check. Returns source counts and last refresh timestamp."
          params={[]}
          example={`curl "https://neo-planner-production.up.railway.app/health"`}
        />

        <Section id="response-schema" title="Response Schema">
          <p>
            The <Code>/targets/tonight</Code> and <Code>/targets/all</Code>{" "}
            endpoints return a JSON object with this structure:
          </p>
          <CodeBlock>{`{
  "total": 2,
  "telescope": { "lat": 42.6, "lon": -71.5, ... },
  "targets": [
    {
      "designation": "C45UKP1",
      "source": "neocp",
      "ra_deg": 5.127,
      "dec_deg": 58.112,
      "mag_v": 19.1,
      "mag_h": 27.2,
      "n_obs": 8,
      "arc_days": 0.01,
      "not_seen_days": 0.02,
      "neo_score": 100.0,
      "pha_score": 19.0,
      "impact_prob": null,
      "predicted_ra_deg": 5.131,
      "predicted_dec_deg": 58.109,
      "predicted_epoch": "2026-02-16T01:40:00+00:00",
      "motion_rate_arcsec_min": 1.2,
      "motion_pa_deg": 45.0,
      "predicted_mag": 19.0,
      "max_exposure_sec": 125.0,
      "observable": true,
      "obs_window_start": "2026-02-15T23:30:00+00:00",
      "obs_window_end": "2026-02-16T03:50:00+00:00",
      "obs_window_hours": 4.33,
      "best_altitude_deg": 49.5,
      "best_airmass": 1.31,
      "best_az_deg": 185.3,
      "best_ha_hours": -0.12,
      "moon_sep_deg": 103.9,
      "transit_time": "2026-02-16T01:40:00+00:00",
      "priority_score": 32.2,
      "source_url": "https://..."
    }
  ]
}`}</CodeBlock>
          <p className="mt-4">
            See the <a href="#fields" className="text-[var(--accent)] hover:underline">Target Fields Explained</a>{" "}
            section for definitions of each field.
          </p>
        </Section>
      </main>
    </div>
  );
}

/* ── Components ──────────────────────────────────────────────────── */

function SidebarLink({ id, label, active }: { id: string; label: string; active: boolean }) {
  return (
    <a
      href={`#${id}`}
      className={`block text-sm py-1 px-2 rounded transition-colors ${
        active
          ? "text-[var(--accent)] bg-[var(--accent)]/10"
          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      }`}
    >
      {label}
    </a>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-12 scroll-mt-8">
      <h3 className="text-xl font-bold mb-3">{title}</h3>
      <div className="text-[var(--text-secondary)] leading-relaxed space-y-2">
        {children}
      </div>
    </section>
  );
}

function Endpoint({
  id,
  method,
  path,
  description,
  params,
  example,
}: {
  id: string;
  method: string;
  path: string;
  description: string;
  params: string[][];
  example: string;
}) {
  return (
    <Section id={id} title="">
      <div className="flex items-center gap-3 mb-2">
        <span className="bg-green-800/50 text-green-300 text-xs font-bold px-2 py-0.5 rounded">
          {method}
        </span>
        <code className="text-[var(--text-primary)] font-mono text-sm">{path}</code>
      </div>
      <p>{description}</p>

      {params.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
            Parameters
          </div>
          <div className="bg-[var(--bg-secondary)] rounded-lg overflow-hidden text-sm">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left px-3 py-2 text-[var(--text-secondary)] font-medium">Name</th>
                  <th className="text-left px-3 py-2 text-[var(--text-secondary)] font-medium">Type</th>
                  <th className="text-left px-3 py-2 text-[var(--text-secondary)] font-medium">Default</th>
                  <th className="text-left px-3 py-2 text-[var(--text-secondary)] font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                {params.map(([name, type, def, desc]) => (
                  <tr key={name} className="border-b border-gray-700/50">
                    <td className="px-3 py-2 font-mono text-[var(--accent)]">{name}</td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{type}</td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{def}</td>
                    <td className="px-3 py-2">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-3">
        <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
          Example
        </div>
        <CodeBlock>{example}</CodeBlock>
      </div>
    </Section>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-[var(--bg-secondary)] text-[var(--accent)] text-sm px-1.5 py-0.5 rounded">
      {children}
    </code>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-[var(--bg-secondary)] rounded-lg p-4 overflow-x-auto text-sm font-mono leading-relaxed">
      {children}
    </pre>
  );
}

function FieldTable({ fields }: { fields: string[][] }) {
  return (
    <div className="bg-[var(--bg-secondary)] rounded-lg overflow-hidden text-sm mt-3">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-700">
            <th className="text-left px-3 py-2 text-[var(--text-secondary)] font-medium w-48">Field</th>
            <th className="text-left px-3 py-2 text-[var(--text-secondary)] font-medium">Description</th>
          </tr>
        </thead>
        <tbody>
          {fields.map(([name, desc]) => (
            <tr key={name} className="border-b border-gray-700/50">
              <td className="px-3 py-2 font-semibold text-[var(--text-primary)] align-top">{name}</td>
              <td className="px-3 py-2 text-[var(--text-secondary)]">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

