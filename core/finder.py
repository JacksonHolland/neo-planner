"""
Finder chart generator — renders an SVG showing the target's position
relative to nearby catalog stars.
"""

from __future__ import annotations

import math
from typing import Dict, List, Optional, Tuple

# ── In-memory cache ──────────────────────────────────────────────────
_finder_cache: Dict[str, str] = {}


def generate_finder_svg(
    ra_deg: float,
    dec_deg: float,
    fov_arcmin: float = 15.0,
    star_mag_limit: float = 15.0,
    image_size: int = 500,
    designation: str = "",
) -> str:
    """
    Generate an SVG finder chart centered on (ra_deg, dec_deg).

    Queries VizieR for nearby stars and renders them as an SVG image.
    Returns an SVG string. Results are cached by (ra, dec, fov).
    """
    cache_key = f"{ra_deg:.4f}_{dec_deg:.4f}_{fov_arcmin}"
    if cache_key in _finder_cache:
        return _finder_cache[cache_key]

    # Query nearby stars
    stars = _query_stars(ra_deg, dec_deg, fov_arcmin / 60.0, star_mag_limit)

    # Render SVG
    svg = _render_svg(ra_deg, dec_deg, fov_arcmin, stars, image_size, designation)

    _finder_cache[cache_key] = svg
    return svg


def _query_stars(
    ra_deg: float,
    dec_deg: float,
    radius_deg: float,
    mag_limit: float,
) -> List[Dict]:
    """Query VizieR for stars near the target position."""
    try:
        from astroquery.vizier import Vizier
        from astropy.coordinates import SkyCoord
        import astropy.units as u

        center = SkyCoord(ra=ra_deg * u.deg, dec=dec_deg * u.deg)

        # Use UCAC4 catalog — good coverage, reasonable depth
        v = Vizier(
            columns=["RAJ2000", "DEJ2000", "Vmag", "f.mag"],
            column_filters={f"Vmag": f"<{mag_limit}"},
            row_limit=200,
        )

        results = v.query_region(
            center,
            radius=radius_deg * u.deg,
            catalog="I/322A/out",  # UCAC4
        )

        if not results or len(results) == 0:
            # Fallback to Tycho-2 for bright stars
            v2 = Vizier(
                columns=["RAmdeg", "DEmdeg", "VTmag"],
                column_filters={"VTmag": f"<{mag_limit}"},
                row_limit=200,
            )
            results = v2.query_region(
                center,
                radius=radius_deg * u.deg,
                catalog="I/259/tyc2",  # Tycho-2
            )
            if not results or len(results) == 0:
                return []

            table = results[0]
            stars = []
            for row in table:
                try:
                    stars.append({
                        "ra": float(row["RAmdeg"]),
                        "dec": float(row["DEmdeg"]),
                        "mag": float(row["VTmag"]),
                    })
                except (ValueError, KeyError):
                    continue
            return stars

        table = results[0]
        stars = []
        for row in table:
            try:
                ra = float(row["RAJ2000"])
                dec = float(row["DEJ2000"])
                mag = float(row.get("Vmag", row.get("f.mag", 14)))
                stars.append({"ra": ra, "dec": dec, "mag": mag})
            except (ValueError, KeyError):
                continue

        return stars

    except Exception as exc:
        print(f"[finder] star query failed: {exc}")
        return []


def _render_svg(
    target_ra: float,
    target_dec: float,
    fov_arcmin: float,
    stars: List[Dict],
    size: int,
    designation: str,
) -> str:
    """Render an SVG finder chart."""
    margin = 40
    plot_size = size - 2 * margin
    fov_deg = fov_arcmin / 60.0
    scale = plot_size / fov_deg  # pixels per degree

    # Background
    lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">',
        f'<rect width="{size}" height="{size}" fill="#0a0e1a"/>',
    ]

    # FOV circle
    cx, cy = size / 2, size / 2
    r = plot_size / 2
    lines.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="#334155" stroke-width="1" stroke-dasharray="4,4"/>')

    # Cardinal directions (N up, E left — standard astronomical convention)
    lines.append(f'<text x="{cx}" y="{margin - 10}" fill="#64748b" text-anchor="middle" font-size="12" font-family="monospace">N</text>')
    lines.append(f'<text x="{cx}" y="{size - margin + 18}" fill="#64748b" text-anchor="middle" font-size="12" font-family="monospace">S</text>')
    lines.append(f'<text x="{margin - 15}" y="{cy + 4}" fill="#64748b" text-anchor="middle" font-size="12" font-family="monospace">E</text>')
    lines.append(f'<text x="{size - margin + 15}" y="{cy + 4}" fill="#64748b" text-anchor="middle" font-size="12" font-family="monospace">W</text>')

    # Grid lines (crosshair at center)
    lines.append(f'<line x1="{cx}" y1="{margin}" x2="{cx}" y2="{size - margin}" stroke="#1e293b" stroke-width="0.5"/>')
    lines.append(f'<line x1="{margin}" y1="{cy}" x2="{size - margin}" y2="{cy}" stroke="#1e293b" stroke-width="0.5"/>')

    # Stars
    cos_dec = math.cos(math.radians(target_dec))
    for star in stars:
        dx = -(star["ra"] - target_ra) * cos_dec * scale  # E is left
        dy = -(star["dec"] - target_dec) * scale  # N is up
        sx = cx + dx
        sy = cy + dy

        # Check if within the plot area
        if (sx - cx) ** 2 + (sy - cy) ** 2 > r ** 2:
            continue

        # Star size inversely proportional to magnitude
        star_r = max(1, min(6, (14 - star["mag"]) * 0.8))
        opacity = max(0.3, min(1.0, (14 - star["mag"]) / 10.0))

        lines.append(
            f'<circle cx="{sx:.1f}" cy="{sy:.1f}" r="{star_r:.1f}" '
            f'fill="white" opacity="{opacity:.2f}"/>'
        )

    # Target marker (crosshair)
    mk_size = 12
    lines.append(f'<line x1="{cx - mk_size}" y1="{cy}" x2="{cx - 4}" y2="{cy}" stroke="#38bdf8" stroke-width="2"/>')
    lines.append(f'<line x1="{cx + 4}" y1="{cy}" x2="{cx + mk_size}" y2="{cy}" stroke="#38bdf8" stroke-width="2"/>')
    lines.append(f'<line x1="{cx}" y1="{cy - mk_size}" x2="{cx}" y2="{cy - 4}" stroke="#38bdf8" stroke-width="2"/>')
    lines.append(f'<line x1="{cx}" y1="{cy + 4}" x2="{cx}" y2="{cy + mk_size}" stroke="#38bdf8" stroke-width="2"/>')

    # Labels
    label = designation or "Target"
    lines.append(f'<text x="{cx + mk_size + 4}" y="{cy - 4}" fill="#38bdf8" font-size="11" font-family="monospace">{label}</text>')

    # FOV label
    lines.append(f'<text x="{size - margin}" y="{size - 8}" fill="#475569" text-anchor="end" font-size="10" font-family="monospace">FOV: {fov_arcmin:.0f}\'</text>')

    # Star count
    n_shown = sum(1 for s in stars if ((-(s["ra"] - target_ra) * cos_dec * scale) ** 2 + (-(s["dec"] - target_dec) * scale) ** 2) <= r ** 2)
    lines.append(f'<text x="{margin}" y="{size - 8}" fill="#475569" font-size="10" font-family="monospace">{n_shown} stars</text>')

    lines.append('</svg>')
    return "\n".join(lines)

