// Bound disk/IPC pressure and buffered file contents while preserving saved order.
// Settle failures individually so missing files can still recover dirty buffers.
export async function* readSessionFiles(tabs, readFile) {
  for (let offset = 0; offset < tabs.length; offset += 4) {
    const batch = tabs.slice(offset, offset + 4).map(async item => {
      if (!item || typeof item !== 'object' || !item.path) return {item};
      try { return {item, disk: await readFile(item.path)}; }
      catch (error) { return {item, error}; }
    });
    for (const result of batch) yield await result;
  }
}
