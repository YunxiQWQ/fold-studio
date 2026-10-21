# Fold Studio 折间

[简体中文](README.md) ｜ **English**

A local-first web workbench for packaging design, built around keeping editing fluid. The workflow — parametric dieline → flat artwork → 3D folding — follows [OpenBox3D](https://github.com/yuyou-dev/OpenBox3D), with the rendering and interaction layer reimplemented for lightness. That project served only as a design and technical reference; none of its application source, presets or assets were copied.

**Live demo:** [tool.heyunxi.top/fold](https://tool.heyunxi.top/fold)
**License:** MIT, copyright Yun-xi, OpenAI Codex and DeepSeek Harness. Third-party code and icon licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

![Fold Studio workspace: structure and dimensions on the left, flat dieline editing in the center, and live 3D folding preview on the right](docs/images/fold-studio-workspace.png)

## Quick start

**Use it online:** open [tool.heyunxi.top/fold](https://tool.heyunxi.top/fold). No account needed.

**Offline single file:** download `fold-studio-v0.10.0.html` from [Releases](https://github.com/YunxiQWQ/fold-studio/releases) and open it with Edge or Chrome. No install, no network, no server — all runtime code is inlined. Verified over `file://` for 3D preview, text editing and draft restore with zero external requests.

**Portable bundle:** [download the v0.10.0 ZIP](https://github.com/YunxiQWQ/fold-studio/releases/download/v0.10.0/fold-studio-v0.10.0.zip), containing the same offline HTML, quick-start instructions, changelog and licenses. SHA-256 checksums are available on the release page.

**Build locally:** Node.js 22 or newer.

```sh
npm ci
npm run build
npm run dev
```

**Local HTTP build:** after building, run `启动折间.cmd`, or:

```powershell
node server.mjs --open
```

Defaults to `http://127.0.0.1:4186` and walks to the next port when occupied — trust the address printed in the terminal. The server binds `127.0.0.1` only and serves `dist/` as static files. Stop it by closing the window or pressing `Ctrl+C`. In the same browser, the offline file and the HTTP build keep separate drafts; move designs between them with `.fold` project files.

## What's implemented

### Parametric structures

- **Twenty-seven parametric packaging structures and containers**, 15–600 mm, grouped into four industry categories:
  - **Folding cartons**: straight tuck carton, reverse tuck carton, lock-bottom carton, curved crease twist carton, lock-lid deck box, hinged display carton, glued-base tuck-top carton, salt carton
  - **Premium gift boxes**: two-piece lid box, sliding drawer box, book-style flip box, one-piece arch-handle tote, gable handle carton
  - **E-commerce and shipping**: hinged-lid mailer, regular slotted carton (RSC), full-overlap slotted container, packaging sleeve, open-top tray
  - **Bottles and cans**: mini can, slim can, classic beverage can, sleek can, tall can, blank metal tin, tall food tin, low food tin, screw-cap metal tin
- **Structure library dialog**: the sidebar keeps the current template card plus a “browse library” entry. A full-screen modal filters by category — all / folding cartons / gift boxes / e-commerce / containers — and each card carries a category badge, bilingual naming, default dimensions and a confirmation step.
- **Thumbnails from the real model**: library, sidebar and inspector share one set of images rendered from the actual geometry, generated at build time and inlined at runtime, with no extra WebGL context.
- **Cylindrical containers**: wrap size derives from $W = \pi \times D$; the flat canvas provides top and bottom label alignment; 3D curls non-linearly from 0% flat to 100% wrapped. Cans get realistic metal rims, a recessed lid and a pull tab.
- **Board-thickness clearance**: lid boxes, drawer sleeves and hardcover shells keep a board gap; tuck flaps, dust flaps and walls get a physical micro-offset so coplanar z-fighting and face bleed do not appear when closed.
- **Curved crease twist carton**: eight quadratic scores, a center score, a 13 mm glue seam, opposed tuck lids and rounded tongues. Defaults retain four 80 mm bays and a 160 mm body, with 80 mm lids and 16 mm tongues (333 × 352 mm sheet). The blurry reference has conflicting totals; bay dimensions follow the user's confirmation. Square sides are linked; the top square turns 45° relative to the bottom. Curved meshes, two-sided artwork, selection, SVG scores and GLB export share the same construction. This is a geometric preview without material-strain, contact or physical-prototype validation.

### Flat editing

Flat interaction runs on **Fabric.js 7.4.0 (MIT)**; the selection rationale is in [EDITOR_REUSE.md](EDITOR_REUSE.md).

- Marquee selection, Shift / Ctrl add and remove, batch selection of layers across panels on the current print side.
- Eight-direction scaling, drag rotation with angle snapping, whole-selection transforms; grouping and ungrouping per print side, persisted with the project and spanning reference panels.
- Edge and centre alignment, horizontal and vertical distribution; snapping lines for panel edges, panel centres and other layers, millimetre rulers and a grid toggle.
- Layer locking, drag reordering, bring to front / send to back, multi-select copy and delete, batch colour and opacity, right-click menu.
- In-place text editing on double click: Chinese and English, multiline, wrapping, paragraph alignment, bold / italic / underline, line height, letter spacing, stroke and monospace.
- Non-destructive image cropping: drag the crop box, percentage nudging, 1:1 and 16:9 presets, live 3D update, cancel and undo; replace an image while keeping its position.
- Shape tools: rectangle, ellipse, plant motif, triangle, arrow, line, with corner radius and stroke.

### Outside and inside, and layout scope

- Outside and inside keep independent layers, paper colours and per-panel fills. The inside is drawn in the reading direction of the paper's reverse, and 3D keeps both textures.
- Artwork spans the whole dieline by default and can be dragged across a crease onto an adjacent panel; a layer can instead be clipped to its reference panel only. Flat canvas, hit testing, 3D atlas and export all use the same scope.
- Multi-layer system clipboard across pages and print sides, preserving physical size, relative placement, layer styles and group ids.

### Packaging elements

- **EAN-13**: built-in checksum, 12 digits auto-completed to 13; standard 95-module layout, guard bars extended downward, standard digit placement.
- **Code 128**: upper and lower case, digits and common half-width symbols, up to 120 characters, modulo-103 checksum generated automatically.
- **QR codes**: bundled [node-qrcode](https://github.com/soldair/node-qrcode) 1.5.4 (MIT), L/M/Q/H error correction, Chinese and long content; insufficient capacity raises a clear error instead of truncating.
- **Symbol library**: 34 searchable, categorised, previewable vector graphics covering transport and storage, recycling and material, food and household; 26 of them come from [Pictogrammers MDI](https://github.com/Templarian/MaterialDesign-SVG) (Apache-2.0).
- Barcodes and QR codes offer an optional white backing plate for scanning reliability, a transparent background and a caption toggle; edits repaint immediately.

### Colour and themes

- The picker is built on [vanilla-colorful](https://github.com/web-padawan/vanilla-colorful) 0.7.2 (MIT); paper colour, per-side background, layer fill, stroke and batch recolour share one interface.
- Saturation and value panels, hue slider, precise HEX / RGB entry, project colours, persistent recent colours, CMYK reference values, and screen picking where the browser supports it.
- Dragging updates 2D and 3D live and collapses into a single history step; cancel or Esc restores each layer's original colour.
- Five themes: studio neutral grey, deep charcoal, CAD blueprint slate, classic light, warm kraft. Switch from the top bar or cycle with `Shift + T`; the preference is written to `localStorage`. Dieline strokes, crease dashes, dimension labels and the 3D studio gradient all adapt.

### 3D preview

- Folding slider with animated playback, perspective / front / side / top views, three quality tiers (eco / balanced / crisp).
- Click the flat canvas or the 3D view to select a panel and print side; ray picking ignores hidden faces and respects occlusion.
- “Unfold and view this side” and “inspect a single panel / return to the whole box” isolate a face while keeping the inspection state across window resizes.
- The viewport expands to full width with `M` for focused artwork work; 3D reframes automatically on the way back.

### Export

- **GLB**: glTF 2.0 binary, embedding the mesh, named panel nodes, PBR materials, paper cut edges and baked textures for both sides (1024 / 2048 / 4096 px); current angle, fully closed and flat-unfolded states; works with Blender, C4D, KeyShot, the Windows 3D Viewer and Web/AR renderers.
- **PNG**: a 3D snapshot, or a flat sheet with transparency.
- **SVG**: vector cut lines, embedded bitmap artwork, plus project metadata that can be reopened.
- **.fold projects**: import and export, both sides included; single-side projects from earlier versions load as outside.

### Projects and storage

- Undo and redo (40 steps), up to 120 layers.
- Drafts autosave to IndexedDB in the current browser and are bound to that origin; download a `.fold` backup for anything important.
- Everything runs locally: no account, no backend, no external fonts, no cloud image service.

## Keyboard shortcuts

`1` / `2` outside / inside · `V` select · `H` pan (or hold space) · `T` text · `I` image · `R` rectangle · `M` expand or restore the flat editor · `P` toggle CMYK soft proof and RGB · `Shift+T` cycle themes · `F` fit flat view · `Shift+F` fit 3D · `G` group / guides · `Shift+G` ungroup · `L` lock · `B` / `I` / `U` text style · `[` / `]` send backward or forward · `Shift+[` / `Shift+]` send to back or front · `Ctrl+A` select all · `Ctrl+C` / `Ctrl+X` / `Ctrl+V` copy, cut, paste · `Ctrl+Shift+V` paste in place · `Ctrl+Z` undo · `Ctrl+Shift+Z` / `Ctrl+Y` redo · `Ctrl+D` duplicate · `Ctrl+S` download project · `Delete` remove · arrow keys nudge layers (5 mm with Shift) · `?` full shortcut list. Use ⌘ instead of Ctrl on macOS. Double click text to edit it; drop an image to add it to the current panel.

## Workflow notes

1. Pick “outside” or “inside” above the canvas, then choose a panel. Added artwork belongs to that side, with independent colours and layers.
2. The “print side” field in the layer inspector moves an existing layer to the other side; copying and pasting also preserves the original.
3. The inside can be hidden once the box closes. “Unfold and view this side” in the 3D area unfolds the structure and turns it to the correct reading direction.
4. Select a layer and press `Ctrl+C`, switch to another tab, the offline page or another project, choose the target panel and side, then press `Ctrl+V`. Text formatting, image data, rotation and physical size travel with it; `Ctrl+Shift+V` keeps the original relative position.
5. Plain text and PNG / JPG / WebP images can be pasted from other pages or applications. Complex layer structures from external editors are not converted into editable layers.

Copy and paste inside input fields keeps native browser behaviour. When reading the clipboard from a button is blocked by permissions, press `Ctrl / ⌘ V` directly; native shortcuts were also verified between two offline pages without Clipboard API permission. Cross-page transfer uses the system clipboard, not an in-page memory copy.

## Performance design

- **Draw on demand**: no always-on render loop while idle; animation stops when the page is hidden.
- **Separated updates**: folding only updates panel matrices, the camera only updates the view; neither rebuilds geometry or bakes artwork.
- **One colour atlas per side**: roughly 768 / 1536 / 2048 px on the longest edge across the three quality tiers; imported images are scaled to 1536 px, and only the changed side is re-uploaded.
- **Capped pixel ratio**: 1.35 on the balanced tier; two directional lights, no shadow maps, HDRI, post-processing or displacement.
- **Resource release**: old geometry is disposed when the structure changes, and atlas textures are released and replaced when their size changes.
- **Independent flat viewport**: the dieline and selection are drawn with Canvas 2D, so zooming and panning never trigger a 3D texture upload.

A note on reading the OpenBox3D source: its `src/render3d/engine.js` runs a persistent `requestAnimationFrame` loop with a DPR of up to 2 and multisampled shadows, and `bake.js` allows atlases up to 4096 with several PBR channels. Those are the workloads this project avoids — **not a complete diagnosis of that project's performance**. No side-by-side speed comparison was run on identical hardware and scenes, and no fixed frame rate or speed-up factor is claimed.

## Current limitations

- Twenty-seven parametric templates and containers are supported. **Automatic recognition of arbitrary external SVG / PDF / DXF dielines, manual crease annotation and cut-line node editing are not implemented**; opening an SVG only works for files this application exported with project metadata. An importer interface is reserved and the plan is in [DXF-IMPORT-PLAN.md](DXF-IMPORT-PLAN.md).
- Artwork can span the whole dieline or be clipped to the reference panel, but stays on the current print side; it will not wrap around a cut edge or across to the reverse of the sheet.
- A fixed 0.45 mm thickness is used for display, with a micro-offset on tucks and overlaps to avoid z-fighting. Industrial paper-thickness compensation, die-cutting tolerances and board spring-back are not modelled.
- Dieline dimensions are based on geometric panels and **must not be treated as verified production data**. There is no CMYK separation, spot colour, bleed, safe area, foil or UV layer output.
- Typefaces come from the system and may differ across machines; SVG keeps the exported bitmaps as they looked at export time.
- Drafts are tied to the current browser and origin; download a `.fold` backup for anything important. A memory-only sample is shown until the first edit writes a draft.
- Fully local: no account, backend, external fonts or cloud image service.

## Development and verification

```powershell
npm install
npm run dev
npm test
npm run build
npm run test:browser
```

Building needs Node.js 22.12+. Verified versions: Node 22.23.3, Vite 8.3.4, Three.js 0.186.1, Playwright 1.64.1.

Browser tests prefer a locally installed Playwright Chromium; point `FOLD_BROWSER_PATH` at your own binary, or run `npx playwright install chromium`. Tests use software WebGL: they verify behaviour and resource updates, not the interactive frame rate of your GPU.

Results and screenshots land in `artifacts/`. `verification.json` records render counters, idle frame deltas, fold updates and feature checks; `surfaces-verification.json` records two-side editing, inside orientation, legacy project migration, real system-clipboard transfer across pages, offline ↔ HTTP hand-off, cut, paste in place, native image paste, shortcuts and the inside SVG round trip.

Key modules: `geometry.js` defines dielines, `folding.js` computes fold matrices, `artwork.js` shares flat drawing, `editor2d.js` handles interaction, `preview3d.js` renders on demand, `project.js` validates projects and history, `storage.js` persists locally, `main.js` wires the interface.

## Deployment

Vercel builds from the repository root with `dist` as the output directory. `vercel.json` maps `/fold` to the application entry while preserving static asset paths, and redirects the root to `/fold`. The build command is pinned to `npx vite build && node scripts/standalone.mjs` so the thumbnail render script never runs in a browser-less build environment.

## License

MIT, see [LICENSE](LICENSE). References and third-party licenses are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

See [SELECTED_MODELS.md](SELECTED_MODELS.md) for the P1–P5 / C1–C3 additions and exact source status. Paper constructions and C1 are original parametric reconstructions; C2's high/low food tins and C3 retain Poly Haven CC0 source geometry with editable artwork UVs and clean materials. C2 also includes a separate salt-carton net. Printable label height is distinct from total container height, and handle holes are preserved in 2D print masks, editing, 3D and exports.
