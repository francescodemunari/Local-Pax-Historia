const assert = require('node:assert/strict');
const { once } = require('node:events');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('../backend/node_modules/playwright');
const { server, wss } = require('../backend/server');
const GameEngine = require('../backend/services/game-engine');

async function run() {
    const engine = new GameEngine(), ids = [];
    let browser;
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        browser = await chromium.launch({ executablePath: process.env.MAP_BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        const errors=[]; page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => route.request().url().startsWith(base+'/') ? route.continue() : route.abort());
        await page.goto(base);
        await page.waitForFunction(() => app.scenarios.length === 3);
        for (const scenarioId of ['ww1-1910','ww2-geographic','world-2010']) {
            const game = await engine.createGame('ITA', undefined, scenarioId); ids.push(game.save_id);
            await page.evaluate(id => app.loadGame(id), game.save_id);
            await page.waitForFunction(id => gameMap.currentScenarioId === id && app.cityManager.cities.length > 50 && app.nationManager.nationLabels.length > 100, scenarioId);
            const result = await page.evaluate(() => {
                const paths=[...gameMap.svgLayer.getElement().querySelectorAll('path')].filter(p=>p.regionData);
                const codes=new Set(paths.map(p=>p.regionData.nation_code));
                const labels=new Set(app.nationManager.nationLabels.map(l=>l.nationCode));
                const cityErrors=app.cityManager.cities.filter(c => Math.abs(c.coords[0]-(c.longitude+180)*4)>.0001 || Math.abs(c.coords[1]-(90-c.latitude)*4)>.0001);
                const anchorErrors=paths.filter(p=>!p.isPointInFill(new DOMPoint(...p.regionData.marker_anchor))).map(p=>p.regionData.id);
                gameMap.map.setZoom(5, {animate:false}); app.nationManager.updateVisibility(5);
                const hidden=app.nationManager.nationLabels.filter(l=>l.marker.getElement()?.classList.contains('nation-label-hidden'));
                return {regions:paths.length,nations:codes.size,missing:[...codes].filter(c=>!labels.has(c)),cityErrors:cityErrors.length,anchorErrors,hidden:hidden.length};
            });
            assert.deepEqual(result.missing,[]); assert.equal(result.cityErrors,0);
            assert.deepEqual(result.anchorErrors,[]); assert.equal(result.hidden,0);
            await page.evaluate(() => { gameMap.map.setView(gameMap.svgToLatLng([760, 190]), 2, {animate:false}); });
            const output=path.resolve(__dirname,'../docs/map-review'); fs.mkdirSync(output,{recursive:true});
            await page.screenshot({path:path.join(output,`${scenarioId}.png`)});
            assert.equal((await engine.loadGame(game.save_id)).units.length,0);
            console.log(scenarioId, JSON.stringify(result));
        }
        assert.deepEqual(errors,[]);
    } finally {
        if(browser)await browser.close();
        for(const id of ids)await engine.deleteSave(id);
        wss.clients.forEach(client=>client.terminate());
        await new Promise(resolve=>wss.close(resolve));
        await new Promise(resolve=>server.close(resolve));
    }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
