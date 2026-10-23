# Markdown in Jotta Edit 1.1.3

Open a `.md` or `.markdown` file, choose **File → New Markdown file**, or select **Markdown** from the status-bar language picker. A formatting toolbar appears and the preview opens beside the source. New Markdown drafts retain their language while you type, save and reopen them.

The preview follows unsaved edits in the active editor. It also follows the focused pane in Split Editor and the working copy in saved-version comparisons. Formatting changes the source as an undoable edit; it does not save the file automatically. Use **Save** when ready. **Format Markdown** and the existing Format Document command use Prettier and preserve prose lines. The existing format-on-save preference applies to Markdown too.

## Formatting tools

- The heading menu offers levels 1–6 using the supplied heading icons. It changes or removes the heading prefix for the selected lines.
- Bold, italic, strikethrough, underline, subscript and superscript wrap the selection. The last three HTML-style forms use `<u>`, `<sub>` and `<sup>`. Empty selections receive an editable placeholder.
- Link and image tools insert Markdown syntax and select the URL/path placeholder for editing. Local paths are relative to the Markdown file; use `/images/example.png` for a workspace-root path.
- Inline code and code blocks choose backtick delimiters that preserve embedded backticks.
- Quote, bulleted list, numbered list and checklist tools apply to whole selected lines. Repeating a line-prefix action removes that prefix. Existing list markers are replaced when changing list type.
- Horizontal rule and table tools insert editable Markdown templates. Multiple distinct selections are supported; overlapping line actions are combined or rejected without partial edits.

## Preview controls

Toggle with **Ctrl+Shift+V**, **View → Markdown preview**, or the toolbar preview button. Closing the panel remembers the hidden state. The formatting toolbar remains available. Drag the divider, or focus it and use Left/Right/Home, to resize the source and preview. The panel hides when the active document is not Markdown and returns for Markdown files.

The preview supports headings, paragraphs, emphasis, fenced code, quotes, lists, checklists, tables, images and links. Text is selectable. Heading links such as `#my-heading` scroll within the preview, relative file links open in the editor, and HTTP/HTTPS/mail links open through the system browser or handler after a click.

Local images load from within the current workspace, or the Markdown document's own folder for standalone files. On desktop, symlinks cannot escape that boundary. In the web version, images must be in the browser workspace or in a folder granted through Open Folder; opening one standalone local file does not grant access to its siblings. Images can be PNG, JPEG, GIF, WebP, AVIF, SVG, BMP or ICO. HTTPS image URLs also render, with no referrer sent. Use Refresh Markdown preview to reload changed local images.

HTML is sanitized before it is added to the preview. Scripts, styles, embedded frames, event handlers and unsafe link schemes are removed. Local files are read only for supported image types; SVG is displayed as an image, not inserted as active page markup. Markdown preview runs inside the application on desktop and web and does not start a Live Preview server.

Preview rendering supports up to 1 MiB of Markdown source; larger files remain editable. Local images support 5 MiB each, with up to 64 images and a 20 MiB local-image cache per active preview. Markdown syntax colouring and normal editing use the existing editor limits.

## Export to HTML or PDF

With a Markdown document active, click **HTML** or **PDF** in its formatting toolbar, or choose **File → Export Markdown as HTML/PDF**. Both commands are also available from the command palette. Export works with the preview closed, including unsaved drafts, the focused split pane and the working copy in a comparison.

Exports capture the current text when you invoke the command. They do not save, format or change the source document. On desktop, the save dialog opens before the export is prepared or images are loaded; choose a local folder and filename. It starts in the source document's folder, or Documents for unsaved and remote drafts. Cancelling stops the export without loading images or writing a file. An export cannot replace a file already open in the editor. HTML downloads in the web edition. Web PDF opens the browser's print dialog: select **Save as PDF** (the name depends on your browser and system), choose the paper size and save. Cancelling a download/save/print dialog leaves your draft intact.

HTML includes a light stylesheet, headings with working section links, tables, checklists, code blocks and embedded local images, so local images travel with the exported document. HTTPS images remain external and require a network connection. Relative document links retain their paths; move linked documents alongside the HTML if needed. PDF uses the same print styling, with A4 pages on desktop and browser print settings on the web.

The same HTML sanitization as the preview removes active content. Export supports up to 1 MiB of Markdown, 64 images, 5 MiB per embedded image and 20 MiB of distinct embedded image data. Missing, inaccessible or oversized individual images become labelled placeholders containing their reference and any alternative text. Available images are still included. Exceeding the source, image-count or total embedded-data limits stops the export. Browser exports have the same folder-access requirements as the preview.

Export progress, the saved file path, missing-image warnings and errors remain visible below the Markdown toolbar buttons, including when the preview is closed. Missing images leave your Markdown source unchanged; correct their paths and export again to include them.
