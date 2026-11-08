# DESIGN.md

The visual system for NAMI. Everything here lives in `app/css/style.css`; the theme is applied by `app/js/app.js` and `main.js`.

## Idea

A liquid-glass surface that sits over a live poster backdrop. Panels are translucent, refract what is behind them, and keep a bright hairline edge. The app is one world at a time: light or dark, chosen in Settings, or following the desktop.

## Tokens

Two multiplier tokens let one set of surfaces serve both themes.

- `--hi-rgb` / `--hi-a`: the "highlight" white. Every glass fill, border, and top rim is a white layer scaled by `--hi-a`. Light uses white at full strength; dark uses white at `0.2`.
- `--shade-rgb` / `--shade-a`: the shadow color. Light shades with navy `31, 52, 92`; dark with black at `1.7`.
- `--line-rgb` / `--line-a`: hairlines and dividers.
- `--knob`: the slider and switch thumb.
- `--canvas`, `--veil-rgb`, `--veil-strong`: the page canvas behind a layer and the fading veil over a blurred poster.

The same rule holds everywhere: `rgba(var(--hi-rgb), calc(<alpha> * var(--hi-a)))`. To retune a theme, change the token, not the rule.

## Palettes

Light, `:root`:

- Ink `#111827`, muted `#667085`, paper `#ffffff`, canvas `#eef2fa`.
- Accent `#0b7cf5`, mint `#0c8f70`, danger `#e5484d`.
- Body background: soft peach, blue, lilac, and mint radial washes over a `#f4f7fd` to `#e9eef9` base.

Dark, `[data-theme="dark"]`:

- Ink `#eef2fa`, muted `#9ba7bf`, paper `#0e131c`, canvas `#0a0e16`.
- Accent `#4d9bff`, mint `#34d1a4`, danger `#ff6b6b`.
- Body background: four deep washes (indigo, teal, violet, green) over `#0c1119` to `#070a11`.
- `color-scheme` flips to `dark`, so native selects and scrollbars follow.

Themes are stored in `~/.local/state/nami/settings.json` under `theme` (`system`, `light`, `dark`). `app.js` resolves `system` against `prefers-color-scheme`, sets `data-theme` on `<html>`, and sends the value to the main process, which sets `nativeTheme.themeSource` and the frameless window background.

## The player

The player is a dark glass world in both themes: video is the subject, so the chrome stays dark and bright. Scrub fill is an iridescent gradient (`#2d6bff` to `#ffb44d`). The scrub thumb is a glass knob with a conic rainbow ring and a specular dot. Controls are circular glass buttons with a sheen. The volume track is blue to cyan with a glass thumb. The settings switches are green glass when on, matching the reference toggle.

## Accessibility paths

- `prefers-reduced-motion`: animations and transitions collapse to near zero.
- `prefers-reduced-transparency`: glass loses its blur and gets an opaque, theme-aware background.
- `prefers-contrast: more`: hairlines darken in light; ink lightens in dark.

## Rules

- A surface that should change with the theme uses the `--hi` / `--shade` / `--line` tokens or a semantic token. No hardcoded light hex outside `:root` and `[data-theme="dark"]`.
- The player block (roughly lines 1898 to 2758 of `style.css`) is the one exception: it is intentionally dark in both themes.
- One radius scale, one shadow style per depth level.
