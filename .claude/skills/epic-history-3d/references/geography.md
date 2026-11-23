# Geography: bbox, mountains, territories

## Bbox
- One bbox for the whole film holds every place mentioned plus a margin of about 15%. Typical sizes: one region (Anatolia, Iberia) is about 15-25° wide, an empire (Ottoman, Roman, Mongol west) about 35-60°, and a continent up to about 90°.
- `make_geo.py` uses Natural Earth 10 m detail for bboxes up to 40° and 50 m above that. Downloads are cached.
- Very wide maps (over 90°) still work but look flatter. Prefer a tighter bbox and two separate map moods if the story jumps continents.

## Mountains
List the real ranges inside the bbox as polylines along their crest, as `[lon, lat]`. Typical values:

| Range | width° | height |
|---|---|---|
| Alps, Caucasus, Zagros (high), Hindu Kush, Himalaya | 1.2-2.0 | 0.9-1.0 |
| Taurus, Pontic, Pyrenees, Carpathians, Atlas, Elburz | 1.0-1.5 | 0.6-0.8 |
| Balkan, Rhodope, Apennines, Dinaric, Pindus, Sinai, Hejaz | 0.8-1.2 | 0.5-0.6 |
| Plateaus (Anatolian, Iranian) | low relief comes automatically from the land | - |

Leave a range out if you are unsure of its course.

## Territories
- Draw borders from well-known historical extents at the year the narration names. Polygons may run into the sea, because the engine clips them to the coastline, so the effort goes into the land borders (rivers, mountain lines, known frontier cities).
- Use 10-40 points per polygon. Follow rivers and mountain crests where the real frontier did.
- To show change, end one polygon (`t_out`) as the next begins (`t_in`), or add a new polygon for the conquered area with `from` at the conqueror's capital.
- Vassals and allies get a lighter tint of the overlord's colour (`opacity` 0.4).
- If an extent is uncertain, show less: a city with a name plate, or a soft `highlight` outline instead of a hard border.

## Places
Use coordinates you are confident of, to two decimals. A city that no longer exists goes where historians place it. If you can't place it, don't show it on the map.
