# NAMI trailer — SPEC

> Superseded in part: the film now runs **57 s cut to the owner's track**
> (`assets/audio/bed.mp3`, sparse hits at 16.0 … 51.5 s), not the 53 s / 120 BPM
> grid below. `REVIEW.md` carries the shipped beat map and the reasons. This file
> stays as the brief the film was built from.

Storyline 1, "A night in one take", picked by the user. Storylines 1–3 stay in `STORYLINES.md`.

```text
GOAL:    the viewer understands NAMI plays anime from ani-cli in a real window,
         and knows where to get it. One sentence: "that is the app, and it is free".
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps
TIME:    53 s = 1590 frames. 120 BPM: 1 beat = 15 frames, 1 bar = 60 frames, 26.5 bars.
LOOK:    ground #06090a (flat, no gradient) with a 1.5% grain during camera pulls;
         ink #e8ecf4; body ink #b6c0cd;
         accent #ff8a66, allowed on exactly four things in the whole film: the cursor,
         the filled play control, one word of the claim, the end-card mark;
         display face Geist 600 (the app's own file, app/fonts/geist-600.woff2),
           trailer titles at 92 px, tracking -0.03em, line height 0.98;
         body face Geist 400 at 34 px; terminal face Geist Mono 400 at 30 px;
         the medium is the product's own UI: real captures of the running app, placed at
           1.0x with the window corner radius 18 px, a 1 px inset highlight at 16% white,
           and a contact shadow 0 24px 50px -34px rgba(0,0,0,.9) (the app's own values);
         light: no vignette, no bloom; each window casts one contact shadow;
         the ground between windows is visible only during the three pull-backs.
OBJECTS: the terminal window (a real titlebar, a real mono plane, the real captured
           output of `ANI_CLI_PLAYER=debug ani-cli -S 1 -e 3 -q best frieren`),
         the NAMI window (the real app: "What are you watching?", the Ctrl K search
           field, "Continue watching", "Trending now", the episode list, the player),
         the cursor (a real 4%-of-frame arrow that enters from off-screen and
           causes the next thing on the same frame),
         the app mark (build/icon.png) and the wordmark (Geist 600, the four letters N A M I)
MOTION:  enter  power4.out, 12-20 frames
         move   power2.inOut, 24-60 frames (camera pushes and pulls)
         exit   power2.in, 10 frames
         cursor power3.out, 10 frames; the click and its result land on the same frame
         spring damping 0.7 on the card-to-detail morph (position and scale only)
         one hero move per shot; secondary moves travel 60% as far and start 5 frames later
SHOTS:   see below, one line each
BANNED:  a dark void with small UI floating in it; glow, bloom, neon, lens flares,
         particles; purple or blue gradients, mesh gradients, floating glass cards;
         a title over a dimmed screenshot; three cards in a row; the logo docked in a
         corner; every element fading and sliding up; text that moves while it is read;
         an invented button or dashboard; mocking ani-cli, the tool NAMI drives;
         a made-up terminal that does not come from real ani-cli output
QA:      check 0, 239, 300, 420, 560, 800, 1040, 1220, 1400, 1520, 1589
```

## Shots

Every shot moves the story: the thing that happens causes the next. One continuous take: the camera never cuts,
it pushes, pulls and travels.

1. **The wall** — 0–239 (0–8.0 s). Terminal window at 92% of frame height, cropped at the left by 6%.
   Real ani-cli output: `Checking dependencies…` (blue) at 0.2 s, `hianime.at links fetched` at 1.2 s,
   the 1080 m3u8 URL at 2.2 s, then `Selected link:`, the long URL, `Subtitles:` and the vtt URL as four
   lines in 24 frames, faster than they can be read, and a blinking caret on an empty prompt from 4.2 s.
   Hero move: a 60-frame push from 1.00x to 1.12x. Sound: 40 Hz sub on every bar, a fan-noise bed, one low
   thunk at 7.6 s. Handoff: the terminal's top-left corner is the point the glass panel will arrive at.
2. **The glass rises** — 240–359 (8.0–12.0 s). The NAMI window rises from the bottom edge over 30 frames on
   `power4.out` and covers the terminal. The terminal is covered, never faded. Hero move: that rise.
   Sound: the fan noise cuts to silence, one glass tick when it lands. Handoff: the search field is the
   topmost thing, directly under where the cursor will enter.
3. **One word** — 360–539 (12–18 s). The cursor enters from the right at frame 360, travels 340 px in 14
   frames, and lands in the real search field. Four keystrokes on the beat: `f` 390, `r` 405, `i` 420, `e` 435.
   The real result grid populates under them. Hero move: a 24-frame punch-in to 1.35x on the field.
   Sound: one key click per keystroke, a soft whoosh as the grid lands. Handoff: the first result card sits
   under the cursor.
4. **Sixteen posters** — 540–779 (18–26 s). Hero move: a 60-frame pan down the real trending grid.
   The real labels are readable: "Trending now" and a title on each poster. Sound: the music opens, a rising
   three-note figure. Handoff: the pan stops with one card under the cursor.
5. **Open it** — 780–1019 (26–34 s). The cursor clicks the card and the card morphs into the detail view:
   the poster becomes the episode list, no cut. Four real episode rows arrive one per beat.
   Hero move: the 24-frame morph at damping 0.7. Sound: one click, then a short rising fill per row.
   Handoff: the cursor is on episode 3's play control.
6. **Play** — 1020–1199 (34–40 s). The cursor clicks episode 3; the play control fills with the accent, and a
   12-frame wipe takes the frame to the real player. Hero move: the wipe. Sound: the loudest hit of the film,
   then the music drops to a pad. Handoff: the player is filling the frame and its own video is moving.
7. **The player** — 1200–1379 (40–46 s). Payoff. The real player fills the frame: the scrub bar moving,
   a real timecode, 1080p, the glass control bar. Hero move: a 40-frame pull from 1.20x to 1.00x; everything
   else holds still. Sound: the pad holds under one synth bass note. Handoff: the player's left edge is clear.
8. **Claim** — 1380–1469 (46–49 s). The player slides 24% to the left and the claim takes the freed right edge
   on the ground. Two lines, one at a time: `ani-cli,` then `in a real window.` The word `real` carries the
   accent. Hero move: the 24-frame slide. Sound: the pad thins to one tone.
9. **End card** — 1470–1589 (49–53 s). The cursor carries the app mark in and clicks it; a fill rises through
   the mark, the wordmark wipes in beside it, and under it lands `github.com/nami-hq/nami`.
   Held 2.4 s. Hero move: the fill rising through the mark. Sound: one final hit on frame 1470, then silence
   under the hold.
