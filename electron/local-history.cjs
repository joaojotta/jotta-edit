'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const policy = import('../shared/local-history.mjs');
class LocalHistory {
  constructor(file) { this.file = file; this.queue = Promise.resolve(); }
  async read() {
    try {
      const stat = await fs.stat(this.file);
      if (stat.size > 128 * 1024 * 1024) throw new Error('Local history exceeds its storage limit');
      const records = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (!Array.isArray(records)) throw new Error('Invalid local history');
      return (await policy).pruneHistory(records);
    } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  }
  mutate(transform) {
    const job = this.queue.catch(() => {}).then(async () => {
      const records = transform(await this.read(), await policy);
      await fs.mkdir(path.dirname(this.file), {recursive:true, mode:0o700});
      const temporary = this.file + '.tmp';
      await fs.writeFile(temporary, JSON.stringify(records), {encoding:'utf8', mode:0o600});
      await fs.rename(temporary, this.file);
    });
    this.queue = job; return job;
  }
  capture(file, snapshots) { return this.mutate((records, {appendHistory}) => appendHistory(records, file, snapshots)); }
  move(source, destination) { return this.mutate((records, {moveHistory, pruneHistory}) => pruneHistory(moveHistory(records, source, destination))); }
  async list(file) { await this.queue.catch(() => {}); return (await policy).historyList(await this.read(), file); }
  async get(file, id) {
    await this.queue.catch(() => {});
    const record = (await this.read()).find(record => record.path === file && record.id === id);
    if (!record) throw new Error('This history version is no longer available.');
    return record;
  }
}
module.exports = {LocalHistory};
