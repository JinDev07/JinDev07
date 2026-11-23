#!/usr/bin/env python3
"""Build the map geography for one film from Natural Earth (public domain).

    python3 make_geo.py <project> --bbox LON_MIN LAT_MIN LON_MAX LAT_MAX [--res 10m|50m]

Writes <project>/src/geo.json:
  {"bbox": [...], "land": [[[lon,lat],...],...], "lakes": [...], "rivers": [...], "coast": [...]}
Coordinates are rounded to 0.01 degree and clipped (loosely) to the bbox plus a margin, so the
file stays small. Natural Earth is public domain (naturalearthdata.com), so no credit is
required; we still name it in credits.md out of courtesy.

Downloads are cached in ~/.cache/epic-history-3d/ so a second film does not fetch again.
"""
import argparse
import json
import pathlib
import urllib.request

BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
CACHE = pathlib.Path.home() / ".cache" / "epic-history-3d"


def fetch(name):
    CACHE.mkdir(parents=True, exist_ok=True)
    p = CACHE / name
    if not p.exists() or p.stat().st_size < 1000:
        print("downloading", name)
        urllib.request.urlretrieve(BASE + name, p)
    return json.loads(p.read_text(encoding="utf-8"))


def rings(geom):
    t = geom["type"]
    c = geom["coordinates"]
    if t == "Polygon":
        return [c[0]] + c[1:]
    if t == "MultiPolygon":
        out = []
        for poly in c:
            out.extend(poly)
        return out
    if t == "LineString":
        return [c]
    if t == "MultiLineString":
        return list(c)
    return []


def inside(bb, ring):
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    return not (max(xs) < bb[0] or min(xs) > bb[2] or max(ys) < bb[1] or min(ys) > bb[3])


def simplify(ring, tol):
    """Drop points closer than tol to the previous kept point (cheap, keeps shape at map scale)."""
    out = [ring[0]]
    for p in ring[1:]:
        q = out[-1]
        if abs(p[0] - q[0]) + abs(p[1] - q[1]) >= tol:
            out.append(p)
    if len(out) < 3 and len(ring) >= 3:
        return [ring[0], ring[len(ring) // 2], ring[-1]]
    return out


def collect(fc, bb, tol, closed, min_pts=3):
    out = []
    for f in fc["features"]:
        for r in rings(f["geometry"]):
            if len(r) < 2 or not inside(bb, r):
                continue
            s = simplify(r, tol)
            if len(s) < (min_pts if closed else 2):
                continue
            out.append([[round(x, 2), round(y, 2)] for x, y in s])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("project")
    ap.add_argument("--bbox", nargs=4, type=float, required=True, metavar=("LON0", "LAT0", "LON1", "LAT1"))
    ap.add_argument("--res", default=None, help="10m (detailed) or 50m; default picks by bbox size")
    a = ap.parse_args()
    lon0, lat0, lon1, lat1 = a.bbox
    span = max(lon1 - lon0, lat1 - lat0)
    res = a.res or ("10m" if span <= 40 else "50m")
    m = span * 0.15
    bb = [lon0 - m, lat0 - m, lon1 + m, lat1 + m]
    tol = 0.02 if res == "10m" else 0.05
    land = collect(fetch(f"ne_{res}_land.geojson"), bb, tol, True)
    lakes = collect(fetch(f"ne_{res}_lakes.geojson"), bb, tol, True)
    rivers = collect(fetch(f"ne_{res}_rivers_lake_centerlines.geojson"), bb, tol, False)
    out = {"bbox": [lon0, lat0, lon1, lat1], "res": res, "land": land, "lakes": lakes, "rivers": rivers}
    dst = pathlib.Path(a.project) / "src" / "geo.json"
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    kb = dst.stat().st_size // 1024
    print(f"wrote {dst} ({kb} KB): {len(land)} land rings, {len(lakes)} lakes, {len(rivers)} rivers, res {res}")


if __name__ == "__main__":
    main()
