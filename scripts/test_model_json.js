const assert = require('node:assert/strict');
const { parseModelJSON } = require('../backend/services/model-json');
const fs=require('node:fs'),path=require('node:path');
const expected = { events: [{ title: 'A {brace}', description: 'Keep literal : +5 and "quotes".' }] };
assert.deepEqual(parseModelJSON('```json\n' + JSON.stringify(expected) + '\n```'), expected);
assert.deepEqual(parseModelJSON('<think>{"events":["not output"]}</think>\n' + JSON.stringify(expected) + '\nDone {comment}'), expected);
assert.deepEqual(parseModelJSON('{"explanation":"not events"}\n' + JSON.stringify(expected)), expected);
assert.throws(() => parseModelJSON('{"events":[],"value":+5}'), /not return valid event JSON/);
assert.throws(() => parseModelJSON('No usable result'), /campaign has not advanced/);
assert.equal(parseModelJSON(JSON.stringify({events:[{description:'literal <think>keep this</think>'}]})).events[0].description, 'literal <think>keep this</think>');
assert.throws(() => parseModelJSON(null), /no event data/);
console.log('✓ Model JSON fences, commentary, quoted braces and invalid-response handling passed');

const raw=fs.readFileSync(path.join(__dirname,'fixtures/malformed-turn-brackets.txt'),'utf8');
const fixed=raw.replace('"day_offset":135}]}],','"day_offset":135}]}}],')
    .replace('"diplomatic_changes":[]}],"events"','"diplomatic_changes":[],"events"');
const expectedTurn=JSON.parse(fixed.replace(/^```json\s*|\s*```\s*$/g,''));
assert.deepEqual(parseModelJSON(raw),expectedTurn,'Every value in the actual malformed reply survives bracket recovery');
assert.deepEqual(parseModelJSON(raw,{requireEvents:false}),expectedTurn,'Military corrections use the same conservative decoder');
assert(require('../backend/services/model-json').wasJSONRecovered(parseModelJSON(raw)));
for(const text of [
    '{"events":[{"title":"Truncated"}',
    '{"wrapper":{"events":[]}',
    '{"events":[]},"unit_changes":[',
    '{"events":[],"value":NaN}',
    '{"events":[],"value":undefined}',
    '{"events":[],"value":+5}',
    '{"events":[],"value":01}',
    '{"events":[],"value":()=>process.exit()}',
    '{"events":[{"description":"unfinished}',
    '{"events":[{"title":"keep","title":"discard"]}',
    '{"events":[{"title":"keep" "description":"missing comma"}]}',
    '{"events":[{"title":"keep",}]}',
])assert.throws(()=>parseModelJSON(text),/valid event JSON/,'Unsafe or incomplete output must not be salvaged: '+text);
assert.deepEqual(parseModelJSON('{"events":[{"title":"Keep } ] and \\"quote\\" intact"]}'),{events:[{title:'Keep } ] and "quote" intact'}]});
assert.deepEqual(parseModelJSON('{"events":[]}],"unit_changes":[]}'),{events:[],unit_changes:[]},'Do not accept a valid prefix and silently discard later effects');
console.log('Recorded bracket failure, unchanged values, complete-root parsing and unsafe/truncated rejection passed');
