# Tyllink Portal — marketing site

A static, single-file marketing site for the Tyllink software-commerce
brand and its product family:

- **Tyllink License** — software commerce + license server (the platform itself)
- **NetOps** — modern terminal for ops teams (the Tlink terminal under its
  product brand)
- **Tlink Studio** — Monaco-powered editor with topology designer
- **Netgen** — config + topology generator

## Files

| File | Purpose |
|------|---------|
| `index.html` | Single-page marketing site. Hero + product catalogue + why + pricing + footer. |
| `styles.css` | Self-contained dark-navy theme. Only external dependency is Inter from Google Fonts. |

All visuals are inline SVG — no images, no build step, no JS framework.
The site renders correctly behind firewalls without third-party CDN
access (other than Google Fonts, which can be self-hosted by replacing
the `<link>` tag with a local `@font-face`).

## Local preview

```sh
cd tyllink-portal
python3 -m http.server 8000
# → open http://localhost:8000
```

Or any other static server (`npx serve .`, `caddy file-server`, etc.).

## Deploy

The site is a static bundle — drop `index.html` + `styles.css` onto:

- AWS Amplify Hosting (matches the existing live site at
  `main.d1rm8kryf89r2j.amplifyapp.com`)
- Cloudflare Pages
- Netlify
- S3 + CloudFront
- Any Nginx / Apache static root

No build, no server runtime, no DB.

## Customizing

The four product cards in `index.html` are the easiest thing to edit —
search for `<!-- Tyllink License -->`, `<!-- NetOps -->`, `<!-- Tlink
Studio -->`, `<!-- Netgen -->`. Each has:

- An icon (inline SVG)
- A name (`<h3>`)
- A tagline (`<p class="product-tagline">`)
- A blurb (`<p class="product-blurb">`)
- A 3-item feature list (`<ul class="product-features">`)
- A CTA (`<a class="product-cta">`)

The accent color of each product card lives in `styles.css` under the
`.product-tyllink`, `.product-netops`, `.product-studio`, `.product-netgen`
class blocks — change one variable to recolor the icon + stripe.

## Theme

Palette anchored on:

- `--bg-deep` `#0a0e1a` — page background
- `--accent` `#3b82f6` — primary brand blue
- `--accent-2` `#60a5fa` — secondary highlights
- `--text` `#e8eef9` — body text
- `--muted` `#94a3b8` — captions / descriptions

All five live in `:root` at the top of `styles.css` — change them and
the whole page rethemes.
