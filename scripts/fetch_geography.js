const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../data/geography');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

async function run() {
    const sources = JSON.parse(fs.readFileSync(path.join(root, 'sources.lock.json'), 'utf8'));
    for (const source of sources) {
        if (!/^[a-z0-9_.-]+$/.test(source.file)) throw new Error('Invalid source filename');
        const target = path.join(root, 'sources', source.file);
        if (fs.existsSync(target) && hash(fs.readFileSync(target)) === source.sha256) continue;
        const response = await fetch(source.url, { signal: AbortSignal.timeout(45000) });
        if (!response.ok) throw new Error(`Download failed for ${source.file}: ${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (hash(bytes) !== source.sha256) throw new Error(`Source changed: ${source.file}. Review before updating the lockfile.`);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target + '.tmp', bytes);
        fs.renameSync(target + '.tmp', target);
    }
    console.log('Geographic source hashes verified.');
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });
