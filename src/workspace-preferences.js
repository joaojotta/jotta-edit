const keys = ['indentMode','tabSize','wrap','formatOnSave','formatWidth'];
export function normalizeProjectSettings(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
  return {indentMode:value.indentMode === 'tabs' ? 'tabs' : 'spaces',
    tabSize:[2,4,8].includes(Number(value.tabSize)) ? Number(value.tabSize) : 2,
    wrap:value.wrap === true || value.wrap === 'true',
    formatOnSave:value.formatOnSave !== false && value.formatOnSave !== 'false',
    formatWidth:['80','100','120'].includes(String(value.formatWidth)) ? String(value.formatWidth) : 'none'};
}
export function workspacePreferences(storage, defaults) {
  const read = (key, fallback) => { try { return JSON.parse(storage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const projects = () => {
    const value = read('jotta.projectSettings', {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  };
  function globalSettings() {
    return normalizeProjectSettings(Object.fromEntries(keys.map(key => [key, storage.getItem('jotta.'+key) ?? storage.getItem('slate.'+key) ?? defaults[key]])));
  }
  return {
    enabled:root => Boolean(root && Object.hasOwn(projects(), root)),
    settings(root) { const all = projects(); return root && Object.hasOwn(all, root) ? normalizeProjectSettings(all[root]) : globalSettings(); },
    enable(root, enabled, current) {
      if (!root) return;
      const all = projects();
      if (enabled) {
        if (!Object.hasOwn(all, root) && Object.keys(all).length >= 100) throw new Error('Project settings limit reached. Reset an unused project first.');
        Object.defineProperty(all, root, {value:normalizeProjectSettings(current), enumerable:true, configurable:true, writable:true});
      } else delete all[root];
      storage.setItem('jotta.projectSettings', JSON.stringify(all));
    },
    remember(root, key, value) {
      if (!keys.includes(key) || !root || !Object.hasOwn(projects(), root)) return false;
      const all = projects(); all[root] = normalizeProjectSettings({...all[root], [key]:value});
      storage.setItem('jotta.projectSettings', JSON.stringify(all)); return true;
    },
    recents() {
      const value = read('jotta.recentWorkspaces', []);
      return Array.isArray(value) ? [...new Set(value.filter(root => typeof root === 'string' && root.length > 0 && root.length <= 8192))].slice(0,20) : [];
    },
    opened(root) { storage.setItem('jotta.recentWorkspaces', JSON.stringify([root,...this.recents().filter(path => path !== root)].slice(0,20))); },
    remove(root) { storage.setItem('jotta.recentWorkspaces', JSON.stringify(this.recents().filter(path => path !== root))); },
    clear() { storage.removeItem('jotta.recentWorkspaces'); }
  };
}
