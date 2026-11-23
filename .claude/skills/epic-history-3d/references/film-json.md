# film.json reference

`src/film.json` is the whole film as data. The engine (`src/Film.jsx` + `src/scenes/*`) reads it, so you never edit engine code to make a film. A full worked example ships in `template/src/film.json` (Constantinople 1453 demo).

## Top level
```json
{
  "title": "Working title",
  "grade": { "contrast": 1.06, "saturate": 1.05, "sepia": 0 },
  "finish": { "vignette": 0.55, "grain": 0.06 },
  "map": { ...shared campaign map, below... },
  "scenes": [ ...in order, end to end... ],
  "sound": { ...optional, see sound.py docstring... }
}
```
`duration` is taken from `timing.json` (voice + 1.5 s). `audio` is set by `sound.py`.

## Times
Absolute seconds (`12.5`) or SRT cue references:
- `"c7"` is the start of cue 7 and `"c7e"` is its end.
- `"c7:Constantinople"` or `"c7:কনস্টান্টিনোপল"` is when that word is spoken (estimated by characters inside the cue). Punctuation and case are ignored. Use `#2` for the second occurrence and `+0.4` / `-0.3` to shift.

Scenes run `from` → `to` and must tile the timeline with no gaps: each scene's `from` equals the previous scene's `to`, the first starts at `0`, and the last ends at the film duration (put a number, e.g. `"to": 312.4`).

Every scene takes `"in"` (the transition into it): `clouds` | `whip` | `dip` | `dipLight` | `flash` | `cut`, plus optional `"grade"`.

## Shared map (`film.map`)
```json
"map": {
  "bbox": [12, 30, 46, 47],          // same bbox as make_geo.py
  "palette": "campaign",              // campaign | parchment | dusk
  "relief": 1.0,                      // height exaggeration
  "objectScale": null,                // size of cities/armies; default map width / 40
  "clouds": 40,
  "sky": { "fog": "#c9c3ad", "sun": "#fff0d6" },
  "mountains": [ { "name": "Taurus", "path": [[29.5,37.0],[32,36.7],[34.5,37.1]], "width": 1.4, "height": 0.8 } ]
}
```
`width` is the range width in degrees; `height` is 0-1 (1 is the Alps or Caucasus, 0.5 is low ranges). A scene may override with `"mapOverride": { "palette": "dusk" }`.

## `map` scene
```json
{ "type": "map", "from": "c2", "to": "c3", "in": "clouds",
  "camera": [ { "t": "c2", "at": [27.5, 40.2], "dist": 16, "pitch": 62, "yaw": -8, "fov": 38 },
              { "t": "c2:capital", "at": [28.9, 41.0], "dist": 5.2, "pitch": 48, "yaw": 6 } ],
  "years": { "keys": [ { "t": "c2", "y": 1450 }, { "t": "c2:1453", "y": 1453 } ], "fmt": "{y} খ্রিস্টাব্দ", "bcFmt": "খ্রিস্টপূর্ব {y}", "pos": "tr", "roll": 1.2 },
  "territories": [ { "name": "Ottoman", "color": "#2f8a57", "polys": [[[lon,lat],...], ...], "t_in": "c3:Ottoman", "dur": 3, "from": [29.06, 40.18], "reach": 0.9, "t_out": "c9", "opacity": 0.62, "flash": true } ],
  "highlights": [ { "poly": [[lon,lat],...], "t_in": "c4:Anatolia", "t_out": "c4e" } ],
  "labels": [ { "text": "OTTOMAN EMPIRE", "at": [31.5, 39.3], "size": 0.6, "rot": -8, "t_in": "c3:empire", "kind": "region|sea", "color": "#123d26" } ],
  "cities": [ { "name": "Edirne", "at": [26.56, 41.68], "size": 0.8, "kind": "castle|dot", "domes": false, "roof": "#2f6b45", "t_in": "c4:Edirne", "plate": true } ],
  "armies": [ { "label": "Ottoman army", "color": "#2f7a4f", "emblem": "crescent", "kind": "infantry|cavalry|archers", "size": 0.9,
               "path": [[26.6,41.66],[27.4,41.47],[28.45,41.2]], "t_in": "c4:army", "move": ["c4:marched", "c5"], "defeat": "c9:defeated", "t_out": "c10" } ],
  "arrows": [ { "path": [[26.7,41.6],[27.5,41.45],[28.8,41.05]], "color": "#c8452c", "width": 0.34, "t_in": "c4:marched-0.5", "dur": 4.5, "t_out": "c6" } ],
  "routes": [ { "path": [[...],[...]], "color": "#f3e6c4", "t_in": "c8:sailed", "dur": 3 } ],
  "battles": [ { "name": "Manzikert", "at": [42.5, 39.1], "t_in": "c11:battle", "t_out": "c12e", "size": 1 } ]
}
```
- **Camera:** `at` is the lon/lat the camera looks at. `dist` is in world units (1 = one degree of longitude at the map's centre latitude; the map width is shown as `P.w`, so for a 34° × 17° bbox around 38°N it is about 27). `pitch` is degrees above the horizon (90 = top-down), `yaw` turns the view, and `fov` is 30-50. Keys ease between each other on a monotone curve.
- **Territories:** fills clip to the coastline. `from` makes the fill spread outward from a point, for conquests, while no `from` fades it in. To show borders changing, end the old polygon (`t_out`) as the new one starts. `polys` takes several rings, which suits an empire in pieces. Always keep the same colour per state.
- **Labels** are painted on the terrain with an ink reveal. Region labels go in small caps style (Cinzel) for Latin text and Noto Serif Bengali for Bangla. Sea labels use `kind: "sea"`. `size` is in degrees of letter height (0.3-1.0).
- **Armies** are game figurines (a coloured base, soldiers and a waving banner) that march along `path` during `move` (start, end) with dust and a drum/horn cue. `defeat` makes them topple. Stop an army a little before a city so it is not hidden inside it.
- **Arrows** are thick, tapered and white-outlined, and draw on over `dur`. Use them for campaigns, attacks and invasions. Width 0.25-0.5°.
- **Years:** the cartouche counts between keys over `roll` seconds. Use the language of the narration in `fmt`; Bangla text converts the digits to Bangla automatically.

## `battle` scene
```json
{ "type": "battle", "from": "c6", "to": "c7", "in": "whip", "sky": "day|dawn|dusk|storm|night", "biome": "grass|steppe|desert|snow|autumn",
  "hills": 1.2, "river": { "z": -6, "amp": 3, "width": 2.5 }, "trees": 90,
  "buildings": [ { "kind": "castle|tent", "x": 0, "z": -26, "size": 7, "domes": true, "rot": 0 } ],
  "units": [ { "label": "Janissaries", "color": "#2f7a4f", "emblem": "crescent", "kind": "infantry|cavalry|archers", "rows": 6, "cols": 18, "spacing": 0.5, "banners": 2,
               "keys": [ { "t": "c6", "x": -6, "z": 12, "rot": 180 }, { "t": "c6:charged", "x": -4, "z": 2, "rot": 170 } ], "rout": "c7:fled", "t_in": "c6" } ],
  "arrows": [ { "path": [[-6, 9], [-4, 0], [-1, -10]], "color": "#c8452c", "t_in": "c6:attack", "dur": 1.6, "width": 2.4 } ],
  "camera": [ { "t": "c6", "at": [0, 2], "dist": 34, "pitch": 30, "yaw": 35 }, { "t": "c7", "at": [-2, -2], "dist": 26, "pitch": 24, "yaw": 15 } ] }
```
The battlefield is about 120 × 90 units. +z is toward the default camera and `rot` is degrees (0 faces +z, 180 faces −z). Keep formations within |x| < 30 and |z| < 25. `rout` makes a unit fall back and drop its banners, with no gore.

## `world` scene
```json
{ "type": "world", "from": "c5", "to": "c6", "in": "clouds", "preset": "city|fortress|camp|fleet|march",
  "sky": "dawn", "biome": "grass", "domes": true, "color": "#6e1b1b", "emblem": "eagle", "wall": "#cbbd9c", "roof": "#9b4a35",
  "move": "reveal|crane|orbit|track",
  "camera": [ { "t": "c5", "pos": [-34, 9, 52], "look": [0, 4, 0], "fov": 42 } ],
  "label": { "text": "Constantinople", "at": [0, 14, 0], "height": 1.6, "t_in": "c5:city" } }
```
`domes: true` gives flat roofs, domes and minarets (Middle East, Byzantium, Central Asia). `false` gives pitched tile roofs (Europe). The city's walls have a radius of about 27, so keep cameras outside it. `fleet` is open sea with ship rows (`ships`, `color`, `color2`).

## `title` scene
```json
{ "type": "title", "from": 0, "to": "c2", "title": "১৪৫৩", "subtitle": "কনস্টান্টিনোপল", "mood": "dusk|dawn|night", "bannerColor": "#6e1b1b", "emblem": "eagle", "ink": "#ffe3a0", "stone": "#6d665b" }
```
Keep the title to 1-3 words and the subtitle to 1-4. It is carved into a stone with braziers and banners and a slow push-in.

## `portrait` scene
```json
{ "type": "portrait", "from": "c8", "to": "c9", "image": "assets/mehmed.jpg", "name": "Sultan Mehmed II", "subtitle": "1432-1481", "bannerColor": "#2f6b45", "emblem": "crescent" }
```
The image comes from `public/`. Leave `image` out for a lit empty frame. Always leave it out for prophets and sacred figures.

## Emblems
`star`, `crescent`, `cross`, `eagle`, `sun`, `lion`, `square`. These are simple heraldic shapes, never real logos or flags of living states.
