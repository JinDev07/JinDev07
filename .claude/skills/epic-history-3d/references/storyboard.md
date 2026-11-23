# Storyboard: from SRT to scenes

1. **Read the whole SRT first** as a story: who, where, when, what changes, the turning point, the ending.
2. **Cut on sentence ends.** A scene starts at a cue start (`"cN"`) and ends at the next scene's start. Merge short cues and split long monologues so most scenes run 3-9 s (10-12 s for a slow map pull-back). Aim for 8-14 cuts a minute.
3. **One hero per scene.** Each scene shows one thing clearly: a territory growing, an army marching, a city, a battle line. The camera lands on it as it is named.
4. **Word-synced events.** For every noun the narrator stresses (empire, city, year, army, river, battle), schedule its visual on that word with a `"cN:word"` time. A good minute has 6-12 such hits.
5. **Variety.** Keep maps at about 50-65% of runtime. Never more than three map scenes in a row, and never the same transition three times in a row. Put a `world` or `battle` scene at least once a minute.
6. **Chapters.** If the narration announces a new part ("Part two", "অধ্যায় দুই") or jumps decades, use a `title` scene with `in: "dip"`.
7. **Camera continuity between map scenes.** The next scene's first camera key should start near where the previous one ended (or use `clouds` to fly somewhere new). Pull back to reveal, push in to name.
8. **The end.** Finish on a slow pull-back over the final map state or a title stone, and leave the last 1.5 s (the tail) calm.

## storyboard.md template
```
| # | time | cues | type | hero | word hits | camera | in |
|---|------|------|------|------|-----------|--------|----|
| 1 | 0.0-5.4 | c1 | title | "1453 / Constantinople" | - | push-in | - |
| 2 | 5.4-11.2 | c2 | map | Byzantine remnant | "city" -> territory, "capital" -> fly-in | wide -> close | clouds |
```
