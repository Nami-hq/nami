# NAMI round 2 — plan

Goal: NAMI ships a second trailer cut to the owner's new reference audio, in the
reference's visual language; the app gains skip-intro and next-episode-on-outro
and installs its own runtime; macOS and Termux get real support; the page gets a
mac section and drops the manual ani-cli instructions.

Reference: `/home/qusai13q/Downloads/ssstik.io_1794226396816.mp4` — 1024×576, 26.17 s,
dark ground, centred kinetic captions (regular + bold, one accent word), real UI
cuts, "free. no ads. no subscriptions." beat, logo end card.

## Steps and acceptance checks

1. **App: skip intro.** Detect an intro window and expose a `Skip intro` control in
   the player. Check: a test drives the pure logic (`npm test`) and a real capture
   shows the button in the chrome.
2. **App: next episode on outro.** When playback nears the end (or the outro
   window is entered) surface `Next episode`. Check: same two checks as step 1.
3. **App: auto-install runtime.** First run downloads `ani-cli` and `yt-dlp` into
   the app's data dir and uses them; no manual terminal step. Check: unit test of
   the resolver, then a real run of a fresh data dir that ends with both binaries
   executable.
4. **macOS: code + build.** Make the runtime installer work on darwin, add a
   GitHub Actions macOS job that produces a real `.dmg` on the release. Check:
   workflow dispatch finishes green and the release asset URL returns 200.
5. **Termux: real path.** Ship `packaging/termux/install.sh` that installs the
   runtime inside Termux and documents the launch. Check: `bash -n`, and the
   script's dependency list matches what the app actually invokes.
6. **Trailer: rebuild** at 1920×1080 to the reference audio and caption language,
   including the new controls, macOS and Termux in the platforms line. Check:
   `hyperframes check` 0 errors, frame review, render verified by `ffprobe`.
7. **Page:** mac section like the other platforms, auto-install copy instead of
   manual instructions, Termux row. Check: every new link resolves (200), the page
   still passes its checks, Pages serves the new HTML.
8. **Ship:** commit, push, verify the live URLs.

Order matters: 1–3 before 6 (the trailer shows the real controls), 4–5 before 7
(the page links real files).
