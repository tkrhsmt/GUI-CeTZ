# GUI CeTZ

GUI CeTZ is a VS Code extension that opens editable parts of `cetz.canvas({ ... })` in the existing [Draw.io Integration extension](https://github.com/hediet/vscode-drawio). The `.typ` file remains the source of truth. Moving or resizing a supported shape in Draw.io updates its numeric arguments in Typst; changing Typst refreshes the diagram.

## Run locally

1. Install **Draw.io Integration** (`hediet.vscode-drawio`) in VS Code.
2. Open this folder in VS Code. From the macOS menu choose **Run → Run Without Debugging** (`実行 → デバッグなしで実行`) and select **Run GUI CeTZ Extension** if prompted. This launches an Extension Development Host without waiting for a debugger.
3. In the Development Host, open [examples/extended.typ](examples/extended.typ), put the cursor in the canvas, and run **CeTZ: Open GUI Editor** from the Command Palette. If the host starts without a folder, use **Cmd+P** and enter the absolute path to `examples/extended.typ`.
4. Move a shape in the Draw.io tab. The `.typ` document updates immediately and participates in VS Code Undo/Redo. Save the `.typ` document to keep the change.

The extension creates a `.cetz-N.drawio` sidecar next to the Typst file for each opened canvas. These files are ignored by Git; Typst remains authoritative. Use **CeTZ: Sync GUI From Typst** to discard a sidecar edit and refresh it from the source.

## Supported editing

| CeTZ in the Typst source | Draw.io operation |
| --- | --- |
| `rect` with two literal coordinates, including `(rel: (dx, dy))`, and a simple numeric or percent corner radius | Move, resize, change simple fill or stroke color and corner rounding, add plain text label |
| `circle` with a literal center and scalar or `(x, y)` radius | Move, resize into a circle or ellipse, change simple colors, add plain text label |
| `line` with two or more literal coordinates | Move endpoints and intermediate points, change simple stroke color, set start/end triangle or diamond marks |
| `content` with a literal coordinate and `[plain text]` | Move and edit its plain text |
| `polygon` with literal center, side count, radius, and optional degree angle | Move; its outline is shown as a Draw.io edge |
| Top-level literal `translate` and positive `scale` | Positions in the GUI follow the transform; geometry edits write local coordinates |
| New Draw.io rectangle, ellipse, text, or free line | Inserts corresponding CeTZ calls; plain labels on new rectangles and ellipses become `content` calls |

Multiple canvases are supported. The canvas under the cursor is selected, or the first canvas when the cursor is elsewhere. Typst expressions and comments outside edited argument ranges are preserved. The bridge reads uncompressed and compressed Draw.io XML.

The GUI is an editing view of the supported subset, not a full CeTZ renderer. Variable coordinates, loops, groups, anchors, complex styles, `set-style`, arbitrary transformations, and drawing functions outside the table remain source-only. A warning appears when the parser recognizes an unsupported shape call. Draw.io operations without a safe source mapping, such as connected edges, changing the number of points on an existing line, or changing an unsupported style, are rejected and the GUI refreshes from Typst. Removing a linked CeTZ shape is also rejected; delete its call in Typst. Colors controlled by expressions must be edited in Typst. The Draw.io editor is supplied by the existing extension under its [GPL-3.0 license](https://github.com/hediet/vscode-drawio/blob/main/LICENSE.md); its code is not copied here.

## Development

`npm test` uses Node's built-in test runner and has no package installation step. The extension uses the VS Code API and built-in Node modules only.

Source modules:

- `src/scanner.js`: finds canvas blocks while respecting strings, comments, and nesting.
- `src/diagram.js`: identifies directly editable CeTZ calls and their exact source ranges.
- `src/drawio.js`: maps basic shapes to and from Draw.io XML.
- `src/extension.js`: commands, documents, source edits, and bidirectional synchronization.
