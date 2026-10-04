const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const http = require('node:http');
const path = require('node:path');

async function run() {
    const occupied = http.createServer((req, res) => res.end('existing application'));
    occupied.listen(0);
    await once(occupied, 'listening');
    const port = occupied.address().port;
    let child;
    try {
        child = spawn(process.execPath, [path.resolve(__dirname, '../backend/server.js')], {
            cwd: path.resolve(__dirname, '../backend'),
            env: { ...process.env, PORT: String(port) },
            stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
        });
        let output = '';
        child.stdout.on('data', chunk => { output += chunk; });
        child.stderr.on('data', chunk => { output += chunk; });
        const deadline = setTimeout(() => child.kill(), 10000);
        const [code] = await once(child, 'close');
        clearTimeout(deadline);
        assert.equal(code, 1, output);
        assert.match(output, new RegExp(`Port ${port} is already in use`));
        assert.doesNotMatch(output, /Unhandled|throw er|node:events/);
        assert.equal((output.match(/already in use/g) || []).length, 1);
        assert.equal(await (await fetch(`http://localhost:${port}`)).text(), 'existing application');
        console.log('✓ Port conflict exits cleanly and leaves the existing application running');
    } finally {
        if (child && child.exitCode === null) child.kill();
        await new Promise(resolve => occupied.close(resolve));
    }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
