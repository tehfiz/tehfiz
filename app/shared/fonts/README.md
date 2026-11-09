# fonts/

## surah-names.woff2

The calligraphic surah names used on the mushaf's surah banners (one glyph per
surah, U+E001–U+E114 by the surah's number written as hex digits — surah 79 is
U+E079 — and U+E000 for سورة).

Source: quran.com's open-source web app,
https://github.com/quran/quran.com-frontend-next
(`public/fonts/quran/surah-names/v1/sura_names.woff2`), which is published
under the MIT licence. Copied unchanged; credited on /privacy#credits.

If its owner ever asks for it to be removed, delete this file: the banners
fall back on their own to the plain Arabic name (the app only switches to the
calligraphy once this font has loaded — see `tz-sn` in tehfiz-shared.js).

## bismillah.svg

The basmala shown above each surah (except At-Tawbah and Al-Fatihah).

- Source: `quran.com-frontend-next/public/bismillah.svg` (github.com/quran/quran.com-frontend-next), MIT licence, same as above.
- Used as a CSS mask (`.bs-cal` in `tehfiz-shared.css`), so it takes the page's ink colour in light and dark.
- Fallback: until the file loads (and if it never does), the plain Uthmani text shows. `tehfiz-shared.js` adds `:root.tz-bsm` once it has loaded.
