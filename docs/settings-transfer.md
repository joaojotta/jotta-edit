# Settings and colour favourites

In the colour editor, enter an optional name and use **Save current** to save a favourite. Edit its name directly in the favourites list, select its square to reuse the colour and opacity, or use × to remove it. Up to 30 favourites are stored. Older unnamed favourites remain available.

**Recent colours** contains the last 12 colours successfully applied from the popup, with their opacity. Selecting a preset or changing a slider does not add a recent colour until you apply it. Cancelled or stale edits are not recorded. Clear the list with **Clear recent colours**. Favourites and recent colours are shared across split editor panes; a checkerboard reveals transparency.

Open **Preferences → General → Settings export and import** on desktop or web:

- **Export settings…** downloads `Jotta-Edit-settings.json` with global editor preferences, fonts, syntax and custom themes, interface and Explorer icon colours, colour favourites, recent colours and custom keyboard shortcuts. Desktop exports also include the selected window decoration, which uses the existing restart prompt when imported on desktop. The web edition ignores desktop window decoration.
- **Import settings…** selects a JSON file, validates it and shows a summary. **Apply imported settings** replaces only the included preferences and collections. **Cancel import** leaves settings unchanged. Files larger than 256 KiB, unsupported formats and invalid values are rejected before changing settings.

Settings apply to the current window without reloading or changing open document contents, selections, Undo history or unsaved drafts. Existing project-specific indentation, wrapping and formatting settings remain active; imported global defaults apply when project overrides are disabled.

The export excludes server and folder favourites, credentials, recent workspaces, project paths, project-specific settings, recovery sessions and local history. Install the same fonts on the receiving device for the same appearance; otherwise the app uses its font fallbacks.
