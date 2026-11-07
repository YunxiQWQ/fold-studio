# CMYK JPEG encoder

`jpeg-cmyk-encoder.js` adapts the baseline DCT/Huffman encoder in **jpeg-js**.

- Original source: https://github.com/jpeg-js/jpeg-js/blob/1031ccd7a63c641c16afb2430279d1598530a85c/lib/encoder.js
- Original source SHA-256: `88469ea7656343c717cd74a4bfc824623ed25277b6685f5e03c5c194d8af48d5`.
- Copyright Adobe Systems Incorporated (2008), Andreas Ritter (JavaScript port, 2009), Eugene Ware / jpeg-js contributors (2014 onward). See the retained source header and `THIRD_PARTY_NOTICES.md` for BSD terms.
- Fold Studio modifications: four independent CMYK channels; no RGB/YCbCr stage or chroma subsampling; inverted Adobe APP14 transform-0 data; four-component SOF/SOS; asynchronous progress; ESM API returning `Uint8Array`. Original DCT, quantization and Huffman routines are retained.

ICC APP2 chunking and physical EXIF DPI are added by `src/export-jpeg.js`. The caller supplies ICC-converted ink samples. Native browser JPEG encoding is used only for RGB output. Tests additionally decode CMYK results with Pillow/libjpeg to verify that the file is genuinely four-channel and has the original profile.
