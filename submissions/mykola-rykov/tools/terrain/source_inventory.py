"""Inspect public tile lists without downloading terrain or declaring data valid."""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
from urllib.request import urlopen


def validate_coverage(region):
    """Conservatively bound every AEQD square point using minimum WGS84 radius."""
    center = region["center"]
    bounds = region["projectedBoundsM"]
    radius = math.hypot(max(abs(bounds["minX"]), abs(bounds["maxX"])),
                        max(abs(bounds["minY"]), abs(bounds["maxY"])))
    # 6,335 km is below the minimum WGS84 meridional radius of curvature.
    latitude_offset = math.degrees(radius / 6_335_000)
    extreme_latitude = abs(center["latitudeDeg"]) + latitude_offset
    if extreme_latitude >= 90:
        raise ValueError("This inventory validator requires a nonpolar region.")
    longitude_offset = latitude_offset / math.cos(math.radians(extreme_latitude))
    envelope = region["sourceEnvelopeDeg"]
    required = {
        "west": center["longitudeDeg"] - longitude_offset,
        "east": center["longitudeDeg"] + longitude_offset,
        "south": center["latitudeDeg"] - latitude_offset,
        "north": center["latitudeDeg"] + latitude_offset,
    }
    if not (envelope["west"] <= required["west"] < required["east"] <= envelope["east"]
            and envelope["south"] <= required["south"] < required["north"] <= envelope["north"]):
        raise ValueError("Source envelope does not cover the entire projected square.")
    return required


def tile_id(latitude, longitude, resolution):
    northing = f"{'N' if latitude >= 0 else 'S'}{abs(latitude):02d}_00"
    easting = f"{'E' if longitude >= 0 else 'W'}{abs(longitude):03d}_00"
    return f"Copernicus_DSM_COG_{resolution}_{northing}_{easting}_DEM"


def build_inventory(region, primary_list, fallback_list, checked_at):
    required = validate_coverage(region)
    primary = set(re.findall(r"Copernicus_DSM_COG_\d+_[NS]\d+_00_[EW]\d+_00_DEM", primary_list))
    fallback = set(re.findall(r"Copernicus_DSM_COG_\d+_[NS]\d+_00_[EW]\d+_00_DEM", fallback_list))
    if not primary or not fallback:
        raise ValueError("Tile lists contain no recognized source ids.")
    envelope = region["sourceEnvelopeDeg"]
    tiles = []
    for latitude in range(math.floor(envelope["south"]), math.ceil(envelope["north"])):
        for longitude in range(math.floor(envelope["west"]), math.ceil(envelope["east"])):
            primary_id = tile_id(latitude, longitude, region["primary"]["resolutionCode"])
            fallback_id = tile_id(latitude, longitude, region["fallback"]["resolutionCode"])
            source = region["primary"] if primary_id in primary else region["fallback"] if fallback_id in fallback else None
            selected_id = primary_id if primary_id in primary else fallback_id if fallback_id in fallback else None
            tiles.append({
                "southDeg": latitude, "westDeg": longitude,
                "status": "primary-listed" if primary_id in primary else "fallback-listed" if fallback_id in fallback else "unknown",
                "sourceId": source["id"] if source else None,
                "nominalResolutionM": source["nominalResolutionM"] if source else None,
                "downloadUrl": f"{source['baseUrl']}/{selected_id}/{selected_id}.tif" if source else None,
                "downloaded": False, "contentValidated": False,
            })
    return {
        "schemaVersion": 1, "regionId": region["id"], "checkedAtUtc": checked_at,
        "coverageCheck": { "status": "passed", "conservativeRequiredEnvelopeDeg": required,
                          "method": "AEQD radial distance with minimum WGS84 curvature bound" },
        "tileLists": [{ "sourceId": region[key]["id"], "url": region[key]["tileListUrl"],
                        "sha256": hashlib.sha256(data.encode()).hexdigest() }
                       for key, data in [("primary", primary_list), ("fallback", fallback_list)]],
        "tiles": tiles,
        "limitations": ["Listing is acquisition evidence, not downloaded terrain validity.",
                        "Missing tiles remain unknown; tile absence never establishes ocean.",
                        "The package builder must validate source metadata, gaps, and actual footprint after reprojection."],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("region", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    region = json.loads(args.region.read_text())
    validate_coverage(region)
    lists = []
    for source in [region["primary"], region["fallback"]]:
        with urlopen(source["tileListUrl"], timeout=60) as response:
            lists.append(response.read().decode())
    inventory = build_inventory(region, *lists, datetime.now(timezone.utc).isoformat())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(inventory, indent=2) + "\n")
    counts = {status: sum(tile["status"] == status for tile in inventory["tiles"])
              for status in ["primary-listed", "fallback-listed", "unknown"]}
    print(json.dumps({"coverage": "passed", "tiles": counts, "output": str(args.output)}))


if __name__ == "__main__":
    main()
