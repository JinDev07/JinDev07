# Credits and licences

This skill combines ideas and workflow rules from three MIT-licensed open-source skills. Its engine code (Remotion + three.js scenes, map painter, sound synthesis) is newly written for it.

| Project | Author | Licence | What this skill takes from it |
|---|---|---|---|
| [cinematic-skill](https://github.com/Moh4696/cinematic-skill) | exploraX (Moh4696) | MIT | Every visual hit timed to the spoken word, one hero per line, review stills and contact sheets before rendering, synthesised SFX with nothing to license |
| [claude-animation-skills / map-route](https://github.com/artemnovitckii/claude-animation-skills) | Artem Novitckii | MIT | A 3D map where a route draws itself while the camera follows, pins and cards dropping in |
| [parallax-doc](https://github.com/sanskarprajapati/parallax-doc) | Sanskar Prajapati | MIT | One always-moving camera, depth layers, hand-offs through objects passing the lens instead of crossfades |

MIT licence text (applies to the works above):

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

## Data and fonts
- Geography: [Natural Earth](https://www.naturalearthdata.com/) (public domain), fetched by `scripts/make_geo.py`.
- Fonts (SIL Open Font License 1.1, from @fontsource on npm): Cinzel, Noto Serif Bengali, Noto Sans Bengali, Oswald, shipped in `template/public/fonts/`.
- Engine libraries: Remotion (Remotion licence: free for individuals and small companies; larger companies need a company licence), three.js (MIT), React (MIT).

## Style references
The user named two YouTube channels as stylistic direction: History Mapped Out for the maps and Epic History for the storytelling. The skill describes their general approach in its own words (`references/style.md`). It contains no material from either channel and must never copy their maps, intros, logos or branding.
