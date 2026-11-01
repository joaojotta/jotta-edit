// Arguments are passed directly to processes, never evaluated by a shell.
export function splitBuildArguments(value = '') {
  if (typeof value !== 'string' || value.length > 8192 || /[\0\r\n]/.test(value)) throw new Error('Invalid build arguments.');
  const args = []; let token = '', quote = '', started = false;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '\\' && quote !== "'" && i + 1 < value.length && /[\s"'\\]/.test(value[i + 1])) {
      token += value[++i]; started = true;
    } else if (quote) {
      if (char === quote) quote = ''; else token += char;
    } else if (char === '"' || char === "'") { quote = char; started = true;
    } else if (/\s/.test(char)) {
      if (started) { args.push(token); token = ''; started = false; }
    } else { token += char; started = true; }
  }
  if (quote) throw new Error('Close the quote in the arguments field.');
  if (started) args.push(token);
  if (args.length > 256) throw new Error('Too many build arguments.');
  return args;
}

export const buildDefaults = Object.freeze({system:'auto', compiler:'gcc', buildDirectory:'build/jotta',
  target:'', testTarget:'test', executable:'', compilerFlags:'', configureArgs:'', runArgs:''});

export function normalizeBuildSettings(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid build settings.');
  const result = {...buildDefaults};
  for (const key of Object.keys(result)) {
    if (value[key] === undefined) continue;
    if (typeof value[key] !== 'string' || value[key].length > 8192 || /[\0\r\n]/.test(value[key])) throw new Error('Invalid build settings.');
    result[key] = value[key];
  }
  if (!['auto','single','cmake','make'].includes(result.system) || !['gcc','clang'].includes(result.compiler)) throw new Error('Invalid build tool.');
  for (const key of ['target','testTarget']) {
    if (result[key].startsWith('-') || /[\s=]/.test(result[key])) throw new Error('Use a target name without spaces, options or variable assignments.');
  }
  return result;
}

export function sourceLanguage(file = '') {
  if (/\.c$/.test(file)) return 'c';
  return /\.(?:C|cc|cp|cpp|CPP|cxx|c\+\+)$/.test(file) ? 'cpp' : null;
}

export function compilerDiagnostic(line) {
  // The greedy path also accepts drive letters and spaces on Windows.
  const match = /^(.*?):(\d+)(?::(\d+))?:\s*(fatal error|error|warning|note):\s*(.*)$/.exec(line.replace(/[\r\n]+$/,''));
  if (!match) return null;
  return {file:match[1], line:Number(match[2]), column:Number(match[3] || 1), severity:match[4], message:match[5]};
}
