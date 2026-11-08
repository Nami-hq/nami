# Trailer review

Composition: `index.html` — 57 s, 1920×1080, 30 fps, one continuous camera.
Music: `assets/audio/bed.mp3` (60.1 s, supplied by the owner), cut to the film's
57 s as `assets/audio/bed-film.mp3` with a 1.6 s tail fade over the track's own
fade, so the ending lands instead of chopping.

## Check status

`npx hyperframes check` — **0 errors** across lint, runtime, layout, motion, contrast,
craft and audio.

| Section  | Result    |
| -------- | --------- |
| lint     | 0 E / 7 W |
| runtime  | 0 E / 0 W |
| layout   | 0 E / 0 W |
| motion   | 0 E / 0 W |
| contrast | 0 E / 0 W |
| craft    | 0 E / 0 W |
| audio    | 0 E / 0 W |

## Accepted warnings

### `nested_structure_needs_subcomposition` ×6 (`#term`, `#win`, `#claimA`, `#claimB`, `#typeA`, `#end`)

The film is **one document with one paused root timeline**, because one camera carries
every section: the terminal tilts out, the window rises through it, the camera tracks into
the search field, travels the results grid, cuts into the detail page on the click, then
holds a slow push through real playback. Splitting these into sub-compositions would give
each its own camera and the seams would show. The root's top-level rows are the sections;
the nested nodes are their contents. Accepted.

### `composition_file_too_large`

Same cause: the single-document constraint above. Accepted.

## Beat map

The track is sparse, not metronomic: hits at 16.0, 20.0, 24.0, 26.5, 32.0, 36.0, 40.0,
43.5, 47.5, 50.0, 51.5 s, with the loudest sustained section at 39.5–41.5 and a fade
from 55.5. Every hit is a 0 ms `tl.set` (a flash or a state change), never an eased tween;
moves that must land start 40–190 ms early.

| Time        | Beat                                                        |
| ----------- | ----------------------------------------------------------- |
| 0.0 – 11.2  | Terminal on a quiet pad: `ani-cli` typed, real output prints |
| 10.2 – 11.7 | Terminal tilts away, the window rises through it             |
| 11.8 – 15.3 | Real home screen, light sweep, slow 3D settle                |
| 15.4 – 16.0 | The window leans in, then snaps flat **on the hit**          |
| 16.0 – 19.4 | **"THE ANI-CLI GUI?"** — letters flip up out of blur         |
| 19.6 – 22.0 | Cursor to search, camera pushes in, `f`→`fr`→`fri`→`frie`    |
| 22.4 – 24.0 | Pull out of the field                                        |
| 24.0 – 26.5 | Cut to the travel pose, pan across the results grid, 3D tilt |
| 26.5 – 27.3 | Click: poster FLIPs into the detail page, blur crossfade     |
| 27.4 – 31.6 | Detail page push, cursor to episode 3                        |
| 32.0 – 32.4 | Player wipes in over the full window **on the hit**          |
| 32.5 – 39.4 | Payoff: two pushes through real playback, handing off at 36  |
| 39.4 – 40.0 | Scrim rises, camera returns                                  |
| 40.0 – 43.5 | **"ani-cli," / "in a real window."**                         |
| 43.5 – 47.1 | **"no browser. no localhost. no server."**                   |
| 47.5 – 51.5 | End card: mark draws, NAMI letters, URL                      |
| 51.5 – 57.0 | Platforms line, warm glow, hold into the track's fade        |

## Real material

Every UI frame is a capture of the packaged NAMI app, never a mock-up:

- `assets/ui/home|search-f|search-fr|search-fri|search-frie|detail|player.webp`
  — renderer screenshots, 2640×1720, taken at 1320 CSS px with a 2× device factor.
- `assets/ui/player-hd.mp4` — 1526×994, 15 fps, 13.1 s, recorded from the running player
  at the window's own size, so the payoff is never upscaled.
- `assets/ui/poster-frieren.webp` — the poster as the app loaded it.
- `assets/anicli.out` — the real `ani-cli` output, redrawn in the terminal beat.
- `assets/icon.png` — the NAMI mark on the end card.

## Known limits

- The player's title pill hard-clips a long series name ("…Journey's End" loses its tail).
  That is the app's own overflow behaviour at this width, reproduced faithfully rather
  than patched in the film.
- The player letterboxes 16:9 footage inside its 1.54 window, so the payoff carries thin
  black bands top and bottom. Also the app's real layout.
