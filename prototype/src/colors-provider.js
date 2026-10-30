// Inline colour swatches + native colour picker, built on Monaco's own
// IColorProvider API rather than a bespoke dialog. Monaco already renders
// the swatch and the picker UI; this module only has to find colours in the
// text (reusing jotta-edit's colour-math utilities) and format them back.
import { findCssColors, formatCssColor } from './color-utils.js';

const COLOR_LANGUAGES = ['html', 'css', 'scss', 'less', 'javascript', 'typescript', 'php'];

function toMonacoColor({ r, g, b, a }) {
  return { red: r / 255, green: g / 255, blue: b / 255, alpha: a };
}
function fromMonacoColor({ red, green, blue, alpha }) {
  return { r: red * 255, g: green * 255, b: blue * 255, a: alpha };
}

export function installColorProvider(monaco) {
  const provider = {
    provideDocumentColors(model) {
      const text = model.getValue();
      return findCssColors(text).map(match => ({
        color: toMonacoColor(match.color),
        range: {
          startLineNumber: model.getPositionAt(match.start).lineNumber,
          startColumn: model.getPositionAt(match.start).column,
          endLineNumber: model.getPositionAt(match.end).lineNumber,
          endColumn: model.getPositionAt(match.end).column
        }
      }));
    },
    provideColorPresentations(_model, colorInfo) {
      const color = fromMonacoColor(colorInfo.color);
      return ['hex', 'rgb', 'hsl'].map(kind => {
        const label = formatCssColor(color, kind);
        return { label, textEdit: { range: colorInfo.range, text: label } };
      });
    }
  };
  for (const language of COLOR_LANGUAGES) monaco.languages.registerColorProvider(language, provider);
}
