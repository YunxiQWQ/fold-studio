# Fold Print Sans (PDF fallback only)

The bundled WOFF2 is a renamed GB2312 + Latin subset of **Noto Sans SC Regular**, copyright © 2014–2021 Adobe. It retains the original font copyright and uses the SIL Open Font License 1.1 in `OFL.txt`.

- Source: https://github.com/notofonts/noto-cjk/blob/main/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf
- Derivative family: `Fold Print Sans`; PostScript name: `FoldPrintSans-Regular`.
- File size: 1,481,040 bytes.
- SHA-256: `96359c29bdb810da1f2d5f4b210fcd9c221ade1c0d897d0795ec4dfd19531286`.
- Reproduce: `uv run --with 'fonttools[woff]' python scripts/subset-print-font.py NotoSansSC-Regular.otf src/fonts/FoldPrintSans-Regular.woff2`.

This font is embedded and subsetted into PDFs. It does not replace the editor's screen fonts. The PDF dialog explicitly identifies it as a replacement; users can load their original TTF/OTF/WOFF font instead. Missing glyphs stop export with a message rather than producing empty boxes. Font files selected by users stay in memory for PDF output and are not uploaded or committed.
