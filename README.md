# GUI CeTZ

GUI CeTZ is a VS Code extension that opens `cetz.canvas({ ... })` in the existing [Draw.io Integration extension](https://github.com/hediet/vscode-drawio). The `.typ` file remains the source of truth. Every canvas, including one containing only CeTZ primitives, is rendered by Typst and shown in Draw.io with the same SVG background. Supported top-level literal shapes receive individual move and resize handles while CeTZ computes their exact appearance.

## See it in action

GUI CeTZ enables both GUI-based operations—which are essential for creating diagrams—and direct manipulation of Typst code.

https://github.com/user-attachments/assets/2c03376b-6c1c-4ebf-ae6e-29fe69fe6987

## Install from a VSIX

1. Install **Draw.io Integration** (`hediet.vscode-drawio`) in VS Code and make the `typst` command available on your PATH.
2. From the root of this repository, package the extension (Node.js and npm are required):

   ```sh
   npx @vscode/vsce package
   ```

   This creates `gui-cetz-0.1.1.vsix` in the repository root (the version in the filename follows `package.json`).
3. Install the generated VSIX with the VS Code command-line tool:

   ```sh
   code --install-extension gui-cetz-0.1.1.vsix
   ```

   Alternatively, in VS Code open the Extensions view, select **… → Install from VSIX…**, and choose the generated file.
4. Open a `.typ` file containing `cetz.canvas`, then click **▶ GUI CeTZ** above the canvas or run **CeTZ: Open GUI Editor** from the Command Palette. Approve the CeTZ plugin when Draw.io asks you to trust it.

## Run locally

1. Install **Draw.io Integration** (`hediet.vscode-drawio`) and the `typst` command-line program in VS Code's environment. When Draw.io first opens, approve the CeTZ plugin in its plugin trust dialog. Draw.io asks again after that file changes.
2. Open this folder in VS Code. From the macOS menu choose **Run → Run Without Debugging** (`実行 → デバッグなしで実行`) and select **Run GUI CeTZ Extension** if prompted. This launches an Extension Development Host with the repository. The first **CeTZ: Open GUI Editor** call registers the CeTZ plugin with Draw.io using its absolute path.
3. In the Development Host, open a `.typ` file containing a `cetz.canvas` call and click **▶ GUI CeTZ** above it. The CodeLens opens that canvas in Draw.io. You can also put the cursor in a canvas and run **CeTZ: Open GUI Editor** from the Command Palette.
4. Move a shape in the Draw.io tab. The `.typ` document updates immediately and participates in VS Code Undo/Redo. Save the `.typ` document to keep the change.

When installed from a VSIX, **CeTZ: Open GUI Editor** registers the plugin bundled with the extension in Draw.io's settings. This also works outside this repository; the first open still requires Draw.io's plugin trust approval. Existing Draw.io plugins are preserved.
After installing an updated VSIX, run **Developer: Reload Window** in every VS Code window using GUI CeTZ. A window that stays open continues running its previously loaded extension code.

The CeTZ shape sidebar stays open at narrow window widths. If an older installation left multiple CeTZ plugin entries in Draw.io settings, opening the GUI replaces them with the current plugin entry.

To try advanced editing, open a `.typ` file containing CeTZ curves or other advanced shapes and use the same button or command. Typst renders its grid, curves, star, group, and boolean shape together in Draw.io. The grid, arc, bezier, and star have individual move and resize handles. Arcs show a blue start-position handle and orange handles at the center and arc end. Dragging the center keeps both endpoints fixed by constraining it to the perpendicular bisector; elliptical arcs use the corresponding distance rule at their existing aspect ratio. Dragging the end updates the stop angle and radius arguments. Bezier, Hobby, Catmull, and line calls show draggable point handles; Bezier endpoints are blue and control points are orange, with dashed guides between them. Moving one handle changes only its corresponding literal arguments in Typst. Selecting a shape or its point handle also shows the CeTZ color, stroke width, and line pattern controls in the left sidebar. Selecting a line also shows start and end mark menus with all 16 built-in CeTZ 0.5.2 symbols; changing one end preserves the other end and any additional mark options. The preview refreshes automatically.

To add an advanced shape, choose it from the **CeTZ** menu in Draw.io, or put the cursor inside a `cetz.canvas` in the `.typ` editor and run **CeTZ: Insert Shape**. Both insert a working source template for `arc`, `mark`, `n-star`, `grid`, `rect-around`, `bezier`, `hobby`, `catmull`, `merge-path`, or `compound-path` (spelled `compound-path` in CeTZ). Supported top-level literal calls have Draw.io selection boxes for moving, resizing, and deleting. The extension writes supported moves and resizes into literal CeTZ coordinate and size arguments and removes a deleted shape's call from Typst. It does not add `scope`, `translate`, or `scale` wrappers. Simple literal fill and stroke settings can be changed in the sidebar; expressions remain editable in Typst.

The Draw.io document is kept in memory and is not saved beside the Typst file. The `.typ` file remains authoritative; save it to keep your edits. VS Code can restore an open CeTZ Draw.io tab after a restart by rebuilding its virtual document from the `.typ` file. Use **CeTZ: Sync GUI From Typst** to refresh the GUI from the source. Older `.cetz-N.drawio` sidecars are no longer used and may be deleted.

## Supported editing

| CeTZ in the Typst source | Draw.io operation |
| --- | --- |
| Top-level `rect`, `circle`, `polygon`, `content`, and `line` with literal coordinates | Move selection boxes; supported sizes can be changed. `line` also has individual point handles, and `rect` supports literal relative endpoints. Edits update CeTZ arguments. |
| The same shapes positioned with named anchors, previous points, relative coordinates, interpolations, or coordinate expressions | Move selection boxes. Typst resolves the handle positions; edits add CeTZ relative offsets while preserving the original coordinate references. Resize these shapes in Typst. |
| Top-level `arc`, `mark`, `n-star`, `grid`, `rect-around`, `bezier`, `hobby`, `catmull`, `merge-path`, `compound-path` with literal points | The same Typst-rendered SVG and per-shape handles; supported geometry changes update literal CeTZ arguments. |
| New shape from the CeTZ palettes or menu | Inserts a CeTZ source template, which then appears in the same preview. |
| Boolean operations, grouping, context, layers, styling, transformations, projections, coordinate resolvers, canvas options, loops, and advanced shapes without resolvable bounds | Typst-rendered SVG preview; edit these calls in the `.typ` source |

Multiple canvases are supported. Each canvas has its own **▶ GUI CeTZ** button; the command palette selects the canvas under the cursor, or the first canvas when the cursor is elsewhere. Typst expressions and comments outside edited argument ranges are preserved. The bridge reads uncompressed and compressed Draw.io XML.

Every canvas uses a Typst-rendered background with individual selection boxes where coordinates can be resolved. Moving, resizing, or deleting a selection box updates only its corresponding CeTZ call. Named anchors and other coordinate expressions in top-level basic shapes can be moved while their source references remain intact. Shapes inside loops or groups, stateful transforms, and advanced shapes without resolvable bounds may use a locked preview. Resizes that cannot be expressed with CeTZ arguments alone, including anchor-based shapes, stretching a star in only one direction, or changing text size, are rejected and the GUI returns to the source geometry. For the preview, imports, definitions, and settings before the selected canvas are kept while ordinary preceding prose and earlier canvases are omitted. If those definitions cannot be compiled in isolation, the renderer retries with the full source prefix, which may include visible preceding content. Draw.io operations without a safe source mapping, such as connected edges, changing the number of points on an existing line, or changing an unsupported style, are rejected and the GUI refreshes from Typst. Colors controlled by expressions must be edited in Typst.

The Draw.io plugin adds a CeTZ menu and a left sidebar palette with distinct icons for advanced shapes. On CeTZ diagrams it shows the CeTZ menu and palettes, and hides Draw.io's unrelated menus, toolbar, format panel, shape-library buttons, and native ruler. The native ruler uses Draw.io coordinates, so the CeTZ axes and coordinate hints in the canvas provide the relevant positions. The CeTZ menu includes zoom, undo, redo, and delete. CeTZ canvases also show a palette of `rect`, `circle`, `content`, and `line` that inserts source templates. Select an editable shape to change its supported fill, stroke color, stroke width, or dash preset in the sidebar. **Undo**, **Redo**, and **Delete selected** in the CeTZ menu act on linked Typst edits; ⌘Z and ⇧⌘Z use the same history while Draw.io is focused. Editing or undoing directly in Typst refreshes the Draw.io view. The Draw.io grid is aligned to the CeTZ origin with four snap intervals per CeTZ unit; dragged anchors snap to quarter units, and generated literal numbers use at most two decimal places. Typst-rendered previews use a transparent background so the grid remains visible. Unsupported Draw.io edits are rejected and refreshed from Typst. Ordinary Draw.io files keep the standard interface. The Draw.io editor itself is supplied by the existing extension under its [GPL-3.0 license](https://github.com/hediet/vscode-drawio/blob/main/LICENSE.md). If the plugin is declined in Draw.io's trust dialog, the standard controls remain visible, but unsupported edits are still rejected by the bridge.

## Development

`npm test` uses Node's built-in test runner and has no package installation step. The extension uses the VS Code API and built-in Node modules only.

Source modules:

- `src/scanner.js`: finds canvas blocks while respecting strings, comments, and nesting.
- `src/diagram.js`: identifies directly editable CeTZ calls and their exact source ranges.
- `src/drawio.js`: maps basic shapes to and from Draw.io XML.
- `src/preview.js`: compiles canvases with Typst and embeds an SVG preview.
- `src/render-diagram.js`: selects editable handles or the locked SVG preview for every canvas.
- `src/style.js`: maps literal colors and strokes to and from Draw.io styles.
- `src/extension.js`: commands, documents, source edits, and bidirectional synchronization.
- `src/cetz-drawio-plugin.js`: CeTZ-only Draw.io palette and style controls.
- `src/templates.js`: validated Typst templates for the advanced shape picker.
- `src/advanced.js`: calibrated SVG preview and source-backed per-shape move/resize handles.
