# NAMI landing page — plan

**Kind:** software (`data-type="software"`, `data-ground="painting"`, `data-radius="round"`,
`data-buttons="tonal"`).

**Deal:** brand `#06090a` / `#e8ecf4` / `#ff8a66`, type `bricolage`; hero `centred`; nav `nav-centre`;
close `close-type`; footer `footer-dark`; rhythm `surface-pairs`; buttons `tonal`; mark `arc`.
Effect `gradient-mesh` (band slot, dark) as the hero frame's ground; card grounds
`painterly-landscape` (the same mesh family), one seed per panel. Moment `liquid-type` on the hero
headline (pointer, SVG filter, the page's one pointer effect).

## Sections

| # | id | idea | picture | screens |
|---|---|---|---|---|
| 1 | `header.nav.nav--centre` | logo left, three words centred, **Download NAMI** right | — | bar |
| 2 | `#top` hero (centred) | what NAMI is, in five words | the real NAMI window as live HTML, `data-fx="gradient-mesh"` | 1 |
| 3 | `#features` features-2x2 | four things it does | four real slices of NAMI's UI on `painterly-landscape` panels | 2 |
| 4 | `#download` downloads | the builds that exist, per platform | the in-app player as live HTML beside the rows | 2 |
| 5 | `#questions` faq | the buyer's last questions, every answer open | — (allowed: an FAQ) | 1 |
| 6 | `footer.closing.footer--dark` | ask for the download once more | — | 2 |

Neighbours never share a layout; the card layout shows once; a calm section (`#questions`) follows
the two visual ones; the close is `close-type` on `footer--dark`.

## Copy

- h1: **An anime player for ani-cli** (26 characters, 2 lines at 72px, 5 words for `liquid-type`).
- Lead: browse, search and play through the `ani-cli` already on the machine; subtitles; light or
  dark.
- Main action, word for word everywhere: **Download NAMI**.
- Every download row names a real file that is in `dist/`.

## Facts the page must not invent

- No Android build exists. The FAQ says so.
- `ani-cli` and `yt-dlp` are runtime dependencies and are not bundled.
- Windows installer is built but not run on Windows; the page claims only the format.
