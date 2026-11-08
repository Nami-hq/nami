# PRODUCT.md

## What this is

NAMI is a desktop anime player for Linux. It gives ani-cli a graphical surface: search a title, pick an episode, watch it in a built-in player. The app uses the same public endpoints as ani-cli 5.1.7 and falls back to the installed `ani-cli` binary if direct resolution fails.

## Who it is for

One person watching anime on a laptop or desktop, in a dim room, with a keyboard and mouse. They already have ani-cli installed and know how to use it. They want the browsing and playback to feel like a finished desktop app, not a terminal wrapper.

## Job to be done

Find a show, choose an episode, and start watching in as few steps as possible. Resume where they stopped. Move to the next episode without leaving the player.

## Success

- Search to playback in three actions: type, click a poster, press play.
- The player explains itself: every control has a label and a keyboard shortcut.
- Progress survives a restart.
- Failures name the problem and offer a retry, in plain language.
- No terminal window appears during normal use.

## Constraints and assumptions

- Linux desktop, Electron shell, local-only. No accounts, telemetry, or remote sync.
- Streams are resolved from hianime.at and its embed hosts. The app needs internet access.
- Playback uses hls.js in Chromium; no mpv or VLC dependency.
- The app keeps its own history under `~/.local/state/nami`. It imports ani-cli's history once and never writes to ani-cli's file.
- Scope: search, trending, anime detail, episodes, history, settings, integrated player. Downloads, syncplay, and ani-skip are out of scope.
- Assumed, not confirmed by the user: Electron is acceptable; the UI ships in English; the default stream preference is sub, best quality; the window starts at 1440x900.

## Voice

Plain, quiet, specific. Controls say what they do. Errors say what failed and what to try. No hype, no exclamation marks, no anime quotes.

## Surfaces

- Discover: search, continue watching, trending.
- Anime detail: poster, synopsis, mode, episode grid.
- Player: full-window video, glass controls, resume, next episode.
- History: progress list.
- Settings: quality, default mode, autoplay, clear history.
