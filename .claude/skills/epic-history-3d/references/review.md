# Review checklist (look at every contact sheet)

Render with `scripts/stills.py <project> --scenes` (two stills per scene) and at every important word hit. Fix and render again until every item passes.

**Map scenes**
- [ ] The map edge is never visible. If it is, lower `dist`, raise `pitch` or move `at` inward.
- [ ] Territories sit on land only, and borders run where the narration and history say.
- [ ] Each arrow is visible and contrasts with the territory under it, and its head points to the target.
- [ ] Armies are not hidden inside a city model, and their name plates don't overlap a city plate.
- [ ] Labels don't collide. Region labels sit inside their region, and sea labels sit on the sea.
- [ ] The year cartouche shows the right year in the right language.
- [ ] Clouds don't cover the hero at its key moment.

**Battle and world scenes**
- [ ] Formations stay on the field (|x| < 30, |z| < 25) and face the right way.
- [ ] The camera is not inside a wall, a tree or the ground, and the city walls are behind or around the camera target.
- [ ] Unit labels are readable.

**Title and portrait**
- [ ] Title text is large and readable (at least 6% of frame height) and spelled exactly as in the narration.
- [ ] Portraits are only user-supplied or public-domain images. No image for sacred figures.

**Whole film**
- [ ] Scenes tile the timeline with no gaps, and the last scene ends at the film duration.
- [ ] Every name, year and number on screen matches the SRT.
- [ ] Transitions vary, and there are no more than three map scenes in a row.
- [ ] `out/sound_report.json`: peak under -1 dBFS and duration equal to the film.
- [ ] `voice_check.json` checksum still matches (`package.py` checks this).
