# GUI CeTZ

GUI CeTZ is a VS Code extension that opens `cetz.canvas({ ... })` in the existing [Draw.io Integration extension](https://github.com/hediet/vscode-drawio). The `.typ` file remains the source of truth. Simple literal shapes can be edited as Draw.io cells. Canvases containing advanced CeTZ operations are rendered by Typst; supported top-level advanced shapes get individual Draw.io move and resize handles while CeTZ still computes their exact geometry and appearance.

## Run locally

1. Install **Draw.io Integration** (`hediet.vscode-drawio`) and the `typst` command-line program in VS Code's environment. When Draw.io first opens, approve the workspace's `src/cetz-drawio-plugin.js` in its plugin trust dialog. Draw.io asks again after that file changes.
2. Open this folder in VS Code. From the macOS menu choose **Run → Run Without Debugging** (`実行 → デバッグなしで実行`) and select **Run GUI CeTZ Extension** if prompted. This launches an Extension Development Host with the repository and CeTZ plugin settings loaded.
3. In the Development Host, open [examples/extended.typ](examples/extended.typ), put the cursor in the canvas, and run **CeTZ: Open GUI Editor** from the Command Palette.
4. Move a shape in the Draw.io tab. The `.typ` document updates immediately and participates in VS Code Undo/Redo. Save the `.typ` document to keep the change.

To try advanced editing, open [examples/advanced.typ](examples/advanced.typ) and run the same command. Typst renders its grid, curves, star, group, and boolean shape together in Draw.io. The grid, arc, bezier, and star have individual move and resize handles. Arcs show a blue start-position handle and orange handles at the circle origin and arc end; dragging the end handle updates the stop angle and radius arguments. Bezier, Hobby, Catmull, and line calls show draggable point handles; Bezier endpoints are blue and control points are orange, with dashed guides between them. Moving one handle changes only its corresponding literal arguments in Typst. Selecting a shape or its point handle also shows the CeTZ color, stroke width, and line pattern controls in the left sidebar. The preview refreshes automatically.

To add an advanced shape, choose it from the **CeTZ** menu in Draw.io, or put the cursor inside a `cetz.canvas` in the `.typ` editor and run **CeTZ: Insert Shape**. Both insert a working source template for `arc`, `mark`, `n-star`, `grid`, `rect-around`, `bezier`, `hobby`, `catmull`, `merge-path`, or `compound-path` (spelled `compound-path` in CeTZ). Each top-level call has a Draw.io selection box for moving, resizing, and deleting. The extension writes supported moves and resizes into literal CeTZ coordinate and size arguments and removes a deleted shape's call from Typst. It does not add `scope`, `translate`, or `scale` wrappers. Edit styling in Typst.

The extension creates a `.cetz-N.drawio` sidecar next to the Typst file for each opened canvas. These files are ignored by Git; Typst remains authoritative. Use **CeTZ: Sync GUI From Typst** to discard a sidecar edit and refresh it from the source.

## Supported editing

| CeTZ in the Typst source | Draw.io operation |
| --- | --- |
| `rect` with two literal coordinates, including `(rel: (dx, dy))`, and a simple numeric or percent corner radius | Move, resize, change simple fill or stroke color and corner rounding, add plain text label |
| `circle` with a literal center and scalar or `(x, y)` radius | Move, resize into a circle or ellipse, change simple colors, add plain text label |
| `line` with two or more literal coordinates | Move endpoints and intermediate points, change simple stroke color, width, predefined dash style, and start/end triangle or diamond marks |
| `content` with a literal coordinate and `[plain text]` | Move and edit its plain text |
| `polygon` with literal center, side count, radius, and optional degree angle | Move; its outline is shown as a Draw.io edge |
| Top-level literal `translate` and positive `scale` | Positions in the GUI follow the transform; geometry edits write local coordinates |
| New Draw.io rectangle, ellipse, text, or free line | Inserts corresponding CeTZ calls; plain labels on new rectangles and ellipses become `content` calls |
| Top-level `arc`, `mark`, `n-star`, `grid`, `rect-around`, `bezier`, `hobby`, `catmull`, `merge-path`, `compound-path` with literal points | Typst-rendered SVG with per-shape Draw.io move and resize handles; supported geometry changes update literal CeTZ arguments |
| Boolean operations, grouping, anchors, context, layers, styling, transformations, projections, coordinate resolvers, canvas options, dynamic Typst code, and advanced shapes without resolvable literal bounds | Typst-rendered SVG preview; edit these calls in the `.typ` source |

Multiple canvases are supported. The canvas under the cursor is selected, or the first canvas when the cursor is elsewhere. Typst expressions and comments outside edited argument ranges are preserved. The bridge reads uncompressed and compressed Draw.io XML.

Advanced shapes use a Typst-rendered background with individual selection boxes. Moving, resizing, or deleting a selection box updates only its corresponding CeTZ call. The boxes are based on literal source coordinates, so expressions, named references in `rect-around`, nested shapes inside groups, and stateful transforms may still use a locked preview. Resizes that cannot be expressed with CeTZ arguments alone, such as stretching a star in only one direction or changing text size, are rejected and the GUI returns to the source geometry. For the preview, imports, definitions, and settings before the selected canvas are kept while ordinary preceding prose and earlier canvases are omitted. If those definitions cannot be compiled in isolation, the renderer retries with the full source prefix, which may include visible preceding content. Draw.io operations without a safe source mapping, such as connected edges, changing the number of points on an existing line, or changing an unsupported style, are rejected and the GUI refreshes from Typst. Colors controlled by expressions must be edited in Typst.

The workspace Draw.io plugin adds a CeTZ menu and a left sidebar palette for advanced shapes. On CeTZ sidecars it hides unrelated shape palettes such as Scratchpad and General, while keeping Draw.io's standard menus, toolbar, format panel, and positioning aids visible. CeTZ canvases also show a palette of `rect`, `circle`, `content`, and `line`. On basic canvases these are editable Draw.io cells; on Typst-rendered previews they insert CeTZ source templates and receive selection boxes for moving, resizing, and deleting. Select a basic shape to change its fill, stroke color, stroke width, dash preset, and line arrows in the sidebar. **Undo**, **Redo**, and **Delete selected** in the CeTZ menu act on linked Typst edits; ⌘Z and ⇧⌘Z use the same history while Draw.io is focused. Editing or undoing directly in Typst refreshes the Draw.io view. CeTZ diagrams enable the Draw.io grid, and Typst-rendered previews use a transparent background so the grid remains visible. Unsupported Draw.io edits are rejected and refreshed from Typst. Ordinary Draw.io files keep the standard interface. The Draw.io editor itself is supplied by the existing extension under its [GPL-3.0 license](https://github.com/hediet/vscode-drawio/blob/main/LICENSE.md). If the plugin is declined in Draw.io's trust dialog, the standard controls remain visible, but unsupported edits are still rejected by the bridge.

## Development

`npm test` uses Node's built-in test runner and has no package installation step. The extension uses the VS Code API and built-in Node modules only.

Source modules:

- `src/scanner.js`: finds canvas blocks while respecting strings, comments, and nesting.
- `src/diagram.js`: identifies directly editable CeTZ calls and their exact source ranges.
- `src/drawio.js`: maps basic shapes to and from Draw.io XML.
- `src/preview.js`: compiles advanced canvases with Typst and embeds an SVG preview.
- `src/style.js`: maps literal colors and strokes to and from Draw.io styles.
- `src/extension.js`: commands, documents, source edits, and bidirectional synchronization.
- `src/cetz-drawio-plugin.js`: CeTZ-only Draw.io palette and style controls.
- `src/templates.js`: validated Typst templates for the advanced shape picker.
- `src/advanced.js`: calibrated SVG preview and source-backed per-shape move/resize handles.
