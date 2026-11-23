---
name: epic-history-3d
description: Builds a 16:9 1080p animated history documentary from the user's own voice MP3 + SRT (Bangla or English). Map style like History Mapped Out (territories that grow and change), storytelling like Epic History (campaign arrows, marching army figurines, 3D battles, chapter titles, portraits), visuals like a historical strategy game (3D relief campaign map, toon models, banners, clouds, moving camera). Built in code with Remotion + three.js, with original synthesised music and SFX; the voice is never altered. Use when the user sends voice + SRT for a history, war, empire or biography documentary, or says "history documentary", "map animation", "Epic History style", "ঐতিহাসিক ডকুমেন্টারি", "ম্যাপ অ্যানিমেশন" or "ডকুমেন্টারি". The user renders with render.bat. Never writes the script.
---

# Epic History 3D: map-driven history documentaries in a strategy-game look

**Input:** the user's voice MP3 and SRT. **Output:** a zipped Remotion project the user renders with `render.bat`. The result is a 1080p film that looks like footage from a historical strategy game and tells the story through maps.

This skill merges three open-source skills (MIT, see `CREDITS.md`) and adds a 3D engine:
- **cinematic-skill (Moh4696):** every hit lands on the spoken word, one hero per line, and a review loop of stills.
- **map-route (artemnovitckii):** a 3D map where a route draws itself while the camera rides along.
- **parallax-doc (sanskarprajapati):** the camera never stops, depth layers, and scene hand-offs through something passing the lens (clouds, whip, dip).

## Hard rules
1. **Inputs are the voice MP3 and SRT only.** Never write or change the script. If only a topic arrives, reply: "ডকুমেন্টারি বানাতে ভয়েসের MP3 আর SRT ফাইল লাগবে।"
2. **The voice is never altered.** `ingest.py` copies it byte for byte and records its SHA-256. `sound.py` adds the bed around the unchanged samples (no gain, EQ, compression or re-timing). `package.py` refuses to ship if the checksum changed.
3. **No subtitles.** The SRT is timing and meaning only. Words on screen are in the world: map labels painted on the terrain, name plates on cities and armies, carved title stones, the game-style date cartouche, plaques under portraits.
4. **Copyright-safe.** Use only code-built models, painted canvas textures, Natural Earth geography (public domain), SIL-OFL fonts shipped in `public/fonts`, synthesised audio, and files the user supplies. No stock footage, photos, AI images, music, models or third-party map tiles. Public-domain paintings are allowed for portraits only when the user supplies them or the network can reach Wikimedia Commons and the file is PD/CC0 (record it in `credits.md`).
5. **Style references are a direction, not a copy.** Never reproduce a channel's logo, intro, specific maps, colours-as-branding, characters or compositions. Take only the general ideas described in `references/style.md`.
6. **Respect.** Neutral, dignified language and visuals for every people, faith and state. Never depict prophets or sacred figures: use a lit empty frame, light, or a place instead. No gore: units fall back, banners drop, smoke rises.
7. **Accuracy.** Every name, year and place on screen must match the narration. Territories, routes and mountain ranges must come from coordinates you are sure of. If unsure, simplify (a smaller region, a city dot) rather than invent. Maps are schematic; say so if asked.
8. **Never render the full film here.** The user renders on their own computer. Check with stills only (plus an optional 2-3 s clip).
9. **Reply in short, simple Bangla** (English if the user writes English).

## Workflow

`$SKILL` = this skill's folder. `$P` = the project folder (put it in the scratchpad; deliver the zip to the user's working directory).

### 0. Set up and ingest
```bash
bash $SKILL/scripts/new_project.sh $P
python3 $SKILL/scripts/ingest.py $P --voice <voice.mp3> --srt <voice.srt>
```
`ingest.py` prints every cue as `c<N> start-end text`. Those cue numbers drive all timing. Copy user assets (logo, portraits) into `$P/public/assets/`.

### 1. Storyboard (read `references/storyboard.md`)
Read the SRT as a story. Cut it into beats on sentence ends, aiming for scenes of 3-9 s and 8-14 cuts a minute. Pick a scene type per beat:

| Beat in the narration | Scene |
|---|---|
| opening, chapter break, a decisive year | `title` (carved stone, braziers, banners) |
| where, who ruled what, expansion, borders changing | `map` + `territories` (spread from a capital) |
| a march, a campaign, an invasion, a voyage by land | `map` + `armies` + `arrows` / `routes` |
| a battle's course (positions, flanks, charges) | `battle` (formations, ground arrows) |
| a city, fortress, camp, fleet, a long march | `world` (preset `city` / `fortress` / `camp` / `fleet` / `march`) |
| a ruler or person introduced | `portrait` (user/PD image) or `map` close-up with a name plate |
| a clash on the map | `map` + `battles` (crossed swords, smoke) |
| ending | `title` or a slow `map` pull-back |

Maps carry most of the film: roughly 50-65% of the runtime is `map`, as in the reference channels. Never put more than three map scenes in a row without a `world`, `battle`, `title` or `portrait` cut. Write `$P/storyboard.md` (working file; don't paste it to the user).

### 2. Geography (read `references/geography.md`)
Choose one bbox that holds the whole story with a margin, then run:
```bash
python3 $SKILL/scripts/make_geo.py $P --bbox LON0 LAT0 LON1 LAT1
```
In `film.json` → `map.mountains`, list the real ranges inside the bbox as polylines. They give the relief its true shape. Draw territories as lon/lat polygons. They clip to the coastline by themselves, so let the edges run into the sea and keep only the land borders careful.

### 3. Write `$P/src/film.json` (full spec: `references/film-json.md`)
- Every time is absolute seconds or a cue reference: `"c12"` (cue start), `"c12e"` (cue end), `"c12:marched"` (when that word is spoken), `"c12:marched-0.3"`.
- **Sync to the word:** a territory spreads on the empire's name, an arrow starts on "marched/advanced", a city rises on its name, the year rolls on the date, an army appears on "army". Camera keys land on the subject as it is named.
- **Camera always moving:** at least two keys per scene with real travel (25-40% push or pull, a yaw drift of 5-20°, a pitch change). Wide establishing shots run at dist ≈ 0.5-0.8 × map width and pitch 55-65°. Close shots run at dist 4-8 and pitch 35-50°. Stay inside the map: the far edge must never show.
- **Transitions** (`"in"` on the next scene): `clouds` (default between map shots and locations), `whip` (action), `dip` (grim/chapter), `dipLight`, `flash` (impact), `cut` (same place, new angle).
- Colours: one colour per faction for the whole film (territory, army base, banners, arrows a shade brighter). Arrows must contrast with the territory under them (white outline is built in).

Then run `python3 $SKILL/scripts/validate.py $P`. It catches unknown words in `"cN:word"`, gaps between scenes, and points outside the map. Fix everything it reports before rendering stills.

### 4. Check stills (read `references/review.md`)
```bash
python3 $SKILL/scripts/stills.py $P --scenes        # 2 stills per scene -> out/check/sheet.jpg
python3 $SKILL/scripts/stills.py $P 12.4 18 22.5    # specific moments (word hits)
```
Look at every sheet. Fix and repeat until clean: labels colliding, army hidden in a city, map edge visible, arrow invisible on its territory, text too small (under ~4% of frame height), a name or year not matching the SRT, the camera inside terrain, an empty frame. Optionally render a 2 s clip to see motion (`npx remotion render ... --frames=a-b --scale=0.5 --gl=swangle`; slow on the CPU here, fast on the user's graphics card).

### 5. Sound
```bash
python3 $SKILL/scripts/sound.py $P
```
This synthesises the score (moods: solemn, tension, epic, triumph, sorrow, outro; `"colour": "eastern"` for Middle-East or Central-Asia stories, `"western"` otherwise), ambience beds and SFX cued from the film. It mixes them around the untouched voice into `public/final_audio.wav` and sets `film.audio`. Add hand cues in `film.sound.sfx` for the big moments: a `boom` on the title reveal, a `riser` before the turning point, a `horn` when an army sets out, a `bell` for a city's fall. Check `out/sound_report.json`: peak under -1 dBFS and duration equal to the film.

### 6. Package and hand over
```bash
python3 $SKILL/scripts/make_bats.py $P
python3 $SKILL/scripts/package.py $P <user-visible-dir> <name>
```
Tell the user in short Bangla: "ভিডিও রেন্ডারের জন্য প্রস্তুত। zip খুলে আগে test_render.bat (১ সেকেন্ডের টেস্ট), তারপর render.bat ডাবল-ক্লিক করো। কম্পিউটারে Node.js লাগবে। তোমার কম্পিউটারের গ্রাফিক্স কার্ড দিয়ে রেন্ডার হবে; শেষ হলে out\final.mp4 পাবে।" Then say in one line what you checked (stills, not the full video) and what is not perfect.

## Known limits (say plainly when relevant)
Models are procedural toy-like strategy-game pieces, not studio assets. There's no lip-sync, and faces only appear in portraits the user supplies. Maps are schematic: coastlines and rivers are real, but borders are drawn by hand from known history. Music is synthesised, cinematic but not a live orchestra. Rendering 1080p 3D needs a reasonable graphics card. Rendering here in the cloud is CPU-only and slow, so only stills are checked before handover.
