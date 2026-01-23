import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { App, MarkdownView, setIcon, TFile } from 'obsidian';
import { QUERY_FLAG_CLOSE, QUERY_FLAG_OPEN } from './constants';
import { PluginSettings } from './types';

function createRefreshButton(onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'dvs-refresh-button';
  btn.setAttribute('aria-label', 'Refresh Dataview Query');
  setIcon(btn, 'refresh-cw');

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });

  return btn;
}

export const refreshButtonExtension = (
  app: App,
  getSettings: () => PluginSettings,
  processFile: (
    file: TFile,
    force?: boolean,
    targetQuery?: string
  ) => Promise<void>
) =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.buildDecorations(update.view);
        }
      }

      buildDecorations(view: EditorView) {
        if (!getSettings().showRefreshButton) {
          return new RangeSetBuilder<Decoration>().finish();
        }

        class RefreshButtonWidget extends WidgetType {
          constructor(private query: string) {
            super();
          }

          toDOM(editorView: EditorView): HTMLElement {
            const btn = createRefreshButton(async () => {
              try {
                const leaf = app.workspace
                  .getLeavesOfType('markdown')
                  .find(
                    (leaf) =>
                      leaf.view instanceof MarkdownView &&
                      leaf.view.contentEl.contains(editorView.dom)
                  );

                if (!(leaf?.view instanceof MarkdownView)) return;
                const file = leaf.view.file;
                if (!file) return;

                await processFile(file, true, this.query);
              } catch (err) {
                console.error('Failed to refresh dataview query', err);
              }
            });

            btn.style.marginLeft = '8px';
            return btn;
          }
        }

        const builder = new RangeSetBuilder<Decoration>();

        for (const { from, to } of view.visibleRanges) {
          const startLine = view.state.doc.lineAt(from);
          const endLine = view.state.doc.lineAt(to);

          for (let i = startLine.number; i <= endLine.number; i++) {
            const line = view.state.doc.line(i);
            const text = line.text;
            const openIdx = text.indexOf(QUERY_FLAG_OPEN);

            if (openIdx !== -1) {
              const closeIdx = text.indexOf(QUERY_FLAG_CLOSE, openIdx);
              if (closeIdx !== -1) {
                const query = text
                  .substring(openIdx + QUERY_FLAG_OPEN.length, closeIdx)
                  .trim();

                const endPos = line.from + closeIdx + QUERY_FLAG_CLOSE.length;
                builder.add(
                  endPos,
                  endPos,
                  Decoration.widget({
                    widget: new RefreshButtonWidget(query),
                    side: 1,
                  })
                );
              }
            }
          }
        }

        return builder.finish();
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );
