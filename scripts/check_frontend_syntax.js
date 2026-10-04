const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function check(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const filename = path.join(directory, entry.name);
        if (entry.isDirectory()) check(filename);
        else if (entry.name.endsWith('.js')) new vm.Script(fs.readFileSync(filename, 'utf8'), { filename });
    }
}

check(path.resolve(__dirname, '../frontend/js'));
console.log('✓ Frontend scripts parse successfully');
