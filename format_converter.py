#!/usr/bin/env python3
"""
format_converter.py — Convert Rubin observations to MPC 80-column and ADES formats.

The Rubin data already includes pre-built MPC 80-column lines in the `obs80`
column. This module can:
  1. Extract the obs80 lines directly (MPC 80-column format).
  2. Convert observations to ADES PSV (Pipe-Separated Values) format.
  3. Convert observations to ADES XML format.
  4. Export as CSV or JSON for internal use.

Usage:
    python format_converter.py --file data/targets_2026-02-12.csv --format mpc80
    python format_converter.py --file data/targets_2026-02-12.csv --format ades-psv -o targets.psv
    python format_converter.py --file data/targets_2026-02-12.csv --format ades-xml -o targets.xml
    python format_converter.py --file data/targets_2026-02-12.csv --format json -o targets.json
"""

from __future__ import annotations

import argparse
import json
import sys
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from typing import Optional
from xml.dom import minidom

import pandas as pd


# ---------------------------------------------------------------------------
# MPC 80-column format
# ---------------------------------------------------------------------------

def to_mpc80(df: pd.DataFrame) -> str:
    """
    Extract MPC 80-column observation lines.

    The Rubin data already has these pre-built in the `obs80` column.
    If `obs80` is not present, we construct it from component fields.
    """
    if "obs80" in df.columns:
        lines = df["obs80"].dropna().tolist()
        return "\n".join(str(line) for line in lines)

    # Fallback: construct from fields (simplified, standard MPC format)
    lines = []
    for _, row in df.iterrows():
        line = _build_obs80_line(row)
        if line:
            lines.append(line)
    return "\n".join(lines)


def _build_obs80_line(row: pd.Series) -> Optional[str]:
    """
    Build an MPC 80-column line from individual fields.
    This is a fallback; the `obs80` column should be preferred.

    MPC 80-column format (simplified):
    Cols  1-5:   Packed designation (number)
    Cols  6-12:  Packed provisional designation
    Col  13:     Discovery asterisk
    Col  14:     Note 1
    Col  15:     Note 2 (observation type: C=CCD)
    Cols 16-32:  Date of observation (YYYY MM DD.ddddd)
    Cols 33-44:  Observed RA  (HH MM SS.ddd)
    Cols 45-56:  Observed Dec (sDD MM SS.dd)
    Cols 57-65:  Blank
    Cols 66-70:  Observed magnitude
    Col  71:     Band
    Col  72-77:  Blank
    Cols 78-80:  Observatory code
    """
    try:
        obstime = pd.Timestamp(row.get("obstime"))
        ra = float(row.get("ra", 0))
        dec = float(row.get("dec", 0))
        mag_val = row.get("mag", "")
        band_val = row.get("band", " ")
        stn_val = str(row.get("stn", "X05"))

        # Date: YYYY MM DD.ddddd
        frac_day = (obstime.hour + obstime.minute / 60 + obstime.second / 3600) / 24
        date_str = f"{obstime.year:4d} {obstime.month:02d} {obstime.day:02d}.{frac_day:.5f}"[:-1]

        # RA: convert degrees to HH MM SS.ddd
        ra_h = ra / 15.0
        ra_hh = int(ra_h)
        ra_mm = int((ra_h - ra_hh) * 60)
        ra_ss = (ra_h - ra_hh - ra_mm / 60) * 3600
        ra_str = f"{ra_hh:02d} {ra_mm:02d} {ra_ss:06.3f}"

        # Dec: convert degrees to sDD MM SS.dd
        dec_sign = "+" if dec >= 0 else "-"
        dec_abs = abs(dec)
        dec_dd = int(dec_abs)
        dec_mm = int((dec_abs - dec_dd) * 60)
        dec_ss = (dec_abs - dec_dd - dec_mm / 60) * 3600
        dec_str = f"{dec_sign}{dec_dd:02d} {dec_mm:02d} {dec_ss:05.2f}"

        # Magnitude
        try:
            mag_str = f"{float(mag_val):5.2f}" if mag_val else "     "
        except (ValueError, TypeError):
            mag_str = "     "

        # Band (single char, map LSST bands)
        band_char = str(band_val)[-1] if band_val else " "

        # Build line (80 chars)
        # Simplified: leave designation area blank, fill key fields
        desig = " " * 12
        disc = " "
        note1 = " "
        note2 = "C"  # CCD

        line = (
            f"{desig}{disc}{note1}{note2}"
            f"{date_str:>17s}"
            f"{ra_str:>12s}"
            f"{dec_str:>12s}"
            f"         "
            f"{mag_str:>5s}"
            f"{band_char}"
            f"      "
            f"{stn_val:>3s}"
        )
        return line[:80].ljust(80)

    except Exception:
        return None


# ---------------------------------------------------------------------------
# ADES PSV (Pipe-Separated Values)
# ---------------------------------------------------------------------------

# ADES PSV header fields for optical observations
ADES_PSV_FIELDS = [
    "permID", "provID", "trkSub", "mode", "stn", "obsTime",
    "ra", "dec", "rmsRA", "rmsDec", "mag", "rmsMag", "band",
    "photCat", "astCat",
]


def to_ades_psv(df: pd.DataFrame) -> str:
    """
    Convert observations to ADES Pipe-Separated Values format.

    Ref: https://minorplanetcenter.net/iau/info/ADES.html
    """
    lines = []

    # Header comment block
    lines.append("# version=2017")
    lines.append("# observatory")
    lines.append("! mpcCode X05")
    lines.append("# submitter")
    lines.append("! name Rubin Observatory / LSST")
    lines.append("# observers")
    lines.append("! name Rubin Observatory / LSST")
    lines.append("# measurers")
    lines.append("! name Rubin Observatory / LSST")
    lines.append("# telescope")
    lines.append("! name Simonyi Survey Telescope")
    lines.append("! aperture 8.4")
    lines.append("! design Reflector")
    lines.append("! detector CCD")

    # Column header
    lines.append("| ".join(ADES_PSV_FIELDS))

    # Data rows
    for _, row in df.iterrows():
        vals = []
        for field in ADES_PSV_FIELDS:
            vals.append(_ades_field_value(row, field))
        lines.append("| ".join(vals))

    return "\n".join(lines)


def _ades_field_value(row: pd.Series, field: str) -> str:
    """Map a dataframe row field to an ADES PSV field value."""
    field_map = {
        "permID": "permid",
        "provID": "provid",
        "trkSub": "trksub",
        "mode": "mode",
        "stn": "stn",
        "obsTime": "obstime",
        "ra": "ra",
        "dec": "dec",
        "rmsRA": "rmsra",
        "rmsDec": "rmsdec",
        "mag": "mag",
        "rmsMag": "rmsmag",
        "band": "band",
        "photCat": "photcat",
        "astCat": "astcat",
    }

    col = field_map.get(field, field.lower())
    val = row.get(col)

    if val is None or (isinstance(val, float) and pd.isna(val)):
        return ""

    if field == "obsTime":
        try:
            ts = pd.Timestamp(val)
            return ts.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        except Exception:
            return str(val)

    return str(val)


# ---------------------------------------------------------------------------
# ADES XML
# ---------------------------------------------------------------------------

def to_ades_xml(df: pd.DataFrame) -> str:
    """
    Convert observations to ADES XML format.

    Ref: https://minorplanetcenter.net/iau/info/ADES.html
    """
    root = ET.Element("optical")

    # Observatory context
    obs_context = ET.SubElement(root, "obsContext")

    observatory = ET.SubElement(obs_context, "observatory")
    ET.SubElement(observatory, "mpcCode").text = "X05"

    submitter = ET.SubElement(obs_context, "submitter")
    ET.SubElement(submitter, "name").text = "Rubin Observatory / LSST"

    telescope = ET.SubElement(obs_context, "telescope")
    ET.SubElement(telescope, "name").text = "Simonyi Survey Telescope"
    ET.SubElement(telescope, "aperture").text = "8.4"
    ET.SubElement(telescope, "design").text = "Reflector"
    ET.SubElement(telescope, "detector").text = "CCD"

    # Observation data block
    obs_data = ET.SubElement(root, "obsData")

    for _, row in df.iterrows():
        obs_elem = ET.SubElement(obs_data, "optical")

        # Designation
        permid = row.get("permid")
        provid = row.get("provid")
        trksub = row.get("trksub")

        if permid and not (isinstance(permid, float) and pd.isna(permid)):
            ET.SubElement(obs_elem, "permID").text = str(permid)
        if provid and not (isinstance(provid, float) and pd.isna(provid)):
            ET.SubElement(obs_elem, "provID").text = str(provid)
        if trksub and not (isinstance(trksub, float) and pd.isna(trksub)):
            ET.SubElement(obs_elem, "trkSub").text = str(trksub)

        # Mode and station
        mode = row.get("mode", "CCD")
        if mode and not (isinstance(mode, float) and pd.isna(mode)):
            ET.SubElement(obs_elem, "mode").text = str(mode)
        ET.SubElement(obs_elem, "stn").text = str(row.get("stn", "X05"))

        # Observation time
        obstime = row.get("obstime")
        if obstime:
            try:
                ts = pd.Timestamp(obstime)
                ET.SubElement(obs_elem, "obsTime").text = ts.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
            except Exception:
                ET.SubElement(obs_elem, "obsTime").text = str(obstime)

        # Position
        ra = row.get("ra")
        dec_val = row.get("dec")
        if ra is not None:
            ET.SubElement(obs_elem, "ra").text = str(ra)
        if dec_val is not None:
            ET.SubElement(obs_elem, "dec").text = str(dec_val)

        # Uncertainties
        for src, dest in [("rmsra", "rmsRA"), ("rmsdec", "rmsDec")]:
            v = row.get(src)
            if v and not (isinstance(v, float) and pd.isna(v)):
                ET.SubElement(obs_elem, dest).text = str(v)

        # Photometry
        mag = row.get("mag")
        if mag and not (isinstance(mag, float) and pd.isna(mag)):
            ET.SubElement(obs_elem, "mag").text = str(mag)
        rmsmag = row.get("rmsmag")
        if rmsmag and not (isinstance(rmsmag, float) and pd.isna(rmsmag)):
            ET.SubElement(obs_elem, "rmsMag").text = str(rmsmag)
        band = row.get("band")
        if band and not (isinstance(band, float) and pd.isna(band)):
            ET.SubElement(obs_elem, "band").text = str(band)

        astcat = row.get("astcat")
        if astcat and not (isinstance(astcat, float) and pd.isna(astcat)):
            ET.SubElement(obs_elem, "astCat").text = str(astcat)

    # Pretty-print
    rough_string = ET.tostring(root, encoding="unicode")
    reparsed = minidom.parseString(rough_string)
    return reparsed.toprettyxml(indent="  ", encoding=None)


# ---------------------------------------------------------------------------
# JSON export
# ---------------------------------------------------------------------------

def to_json(df: pd.DataFrame) -> str:
    """Convert observations to JSON (array of objects)."""
    records = json.loads(df.to_json(orient="records", date_format="iso"))
    return json.dumps(records, indent=2)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

FORMATS = {
    "mpc80": ("MPC 80-column", ".txt", to_mpc80),
    "ades-psv": ("ADES PSV", ".psv", to_ades_psv),
    "ades-xml": ("ADES XML", ".xml", to_ades_xml),
    "json": ("JSON", ".json", to_json),
    "csv": ("CSV", ".csv", None),  # handled separately
}


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Convert Rubin observations to MPC/ADES formats.",
    )
    p.add_argument("--file", type=Path, required=True,
                   help="Input file (Parquet or CSV)")
    p.add_argument("--format", "-f", choices=list(FORMATS.keys()), default="mpc80",
                   help="Output format (default: mpc80)")
    p.add_argument("--output", "-o", type=Path, default=None,
                   help="Output file path (default: stdout)")
    p.add_argument("--limit", type=int, default=None,
                   help="Limit number of observations to convert")
    return p.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> None:
    args = parse_args(argv)

    if not args.file.exists():
        print(f"Error: file not found: {args.file}", file=sys.stderr)
        sys.exit(1)

    # Load data
    if args.file.suffix == ".parquet":
        df = pd.read_parquet(args.file)
    else:
        df = pd.read_csv(args.file)

    if args.limit:
        df = df.head(args.limit)

    fmt_name, default_ext, converter = FORMATS[args.format]
    print(f"[convert] {len(df):,} observations → {fmt_name}", file=sys.stderr)

    # Convert
    if args.format == "csv":
        output_text = df.to_csv(index=False)
    else:
        output_text = converter(df)

    # Output
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with open(args.output, "w") as f:
            f.write(output_text)
        print(f"[output] Written to {args.output}", file=sys.stderr)
    else:
        print(output_text)


if __name__ == "__main__":
    main()

