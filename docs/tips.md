# Tips

This page contains useful tips and tricks shared by the community.

## Recommended CSS Snippets

### Hide HTML Comments on Non-Active Lines

Since this plugin uses HTML comments for query definitions and serialized output markers, your notes may appear cluttered with comment tags. You can use a CSS snippet to hide these comments on non-active lines, showing only a collapsed indicator (`<!-- …`) until you click on that line.

Create a file named `hide-non-active-comments.css` in your vault's `.obsidian/snippets/` folder with the following content:

```css
/* Hide HTML comments in non-active lines (displays as `<!-- …`) */
.cm-line:not(.cm-active) .cm-comment:not(.cm-hmd-codeblock) {
  display: block;
  max-width: 5ch;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-style: italic;
}
```

Then enable the snippet in **Settings → Appearance → CSS snippets**.

**Without the snippet**: All HTML comments are fully visible, which can be visually noisy.

**With the snippet**: Comments on non-active lines collapse to `<!-- …`, and expand when you place your cursor on that line.

This provides a cleaner editing experience while still allowing you to see and edit the full comment content when needed.

*Thanks to [@vergenzt](https://github.com/vergenzt) for sharing this snippet in [issue #37](https://github.com/dsebastien/obsidian-dataview-serializer/issues/37).*
