/* Cached raster tiles over the scenario's existing vector geometry. */
class ScenarioTiles extends L.GridLayer {
    constructor(owner, svg) {
        super({ tileSize: 256, keepBuffer: 3, updateWhenIdle: false, updateInterval:120, updateWhenZooming: false, maxNativeZoom:4,
            minZoom: -4, maxZoom: 5, pane: 'overlayPane', className: 'scenario-tiles' });
        this.owner = owner;
        this.buckets = new Map();
        this.records = [...svg.querySelectorAll('path')].map((element, order) => {
            const bounds = element.getBBox();
            // Consumers (labels, focus and selection) must not ask detached SVG
            // geometry to perform layout. Paths are immutable within a scenario.
            element.getBBox = () => bounds;
            const record = { element, order, bounds, path: null,
                region: Boolean(element.regionData), fillRule: element.getAttribute('fill-rule') || 'nonzero' };
            // Native SVG hit tests can return false once the SVG is detached.
            // Labels and interior anchors need the same geometry as map picking.
            element.isPointInFill = point => this.hitContext.isPointInPath(
                record.path ||= new Path2D(element.getAttribute('d')), point.x, point.y, record.fillRule);
            for (let x = Math.floor(bounds.x / 64); x <= Math.floor((bounds.x + bounds.width) / 64); x++) {
                for (let y = Math.floor(bounds.y / 64); y <= Math.floor((bounds.y + bounds.height) / 64); y++) {
                    const key = `${x},${y}`;
                    if (!this.buckets.has(key)) this.buckets.set(key, []);
                    this.buckets.get(key).push(record);
                }
            }
            return record;
        });
        this.hitContext = document.createElement('canvas').getContext('2d');
        this.jobs = new Map(); this.nextJob = 0;
        this.tileCache=new Map();this.cacheBytes=0;this.paintRevision=0;
        if (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
            try {
                this.worker = new Worker('/js/map-tile-worker.js');
                this.worker.onmessage = ({data}) => {
                    if(data.type==='hit') { const done=this.hitReplies?.get(data.id);this.hitReplies?.delete(data.id);done?.(this.records[data.order]?.element||null);return; }
                    const job = this.jobs.get(data.id); this.jobs.delete(data.id);
                    if (!job || job.revision!==this.paintRevision) { data.bitmap?.close(); return; }
                    if (data.error) job.canvas.getContext('2d').drawImage(this.paintTile(job.coords),0,0);
                    else { job.canvas.getContext('2d').drawImage(data.bitmap,0,0); job.canvas.dataset.renderer='worker'; data.bitmap.close(); }
                    this.rememberTile(job.key,job.canvas);
                    if(!job.unloaded)job.done(null,job.canvas);
                };
                this.worker.onerror = () => {
                    this.worker?.terminate(); this.worker = null;
                    for(const resolve of this.hitReplies?.values()||[])resolve(null);this.hitReplies?.clear();
                    for (const job of this.jobs.values()) { job.canvas.getContext('2d').drawImage(this.paintTile(job.coords),0,0); job.done(null,job.canvas); }
                    this.jobs.clear();
                };
                this.worker.postMessage({type:'init',width:owner.svgWidth,height:owner.svgHeight,origin:owner.svgOrigin||[0,0],records:this.records.map(r=>({
                    order:r.order,region:r.region,bounds:{x:r.bounds.x,y:r.bounds.y,width:r.bounds.width,height:r.bounds.height},d:r.element.getAttribute('d'),fillRule:r.fillRule,
                    fill:this.paintFill(r),
                    stroke:r.region?null:r.element.getAttribute('stroke'),strokeWidth:Number(r.element.getAttribute('stroke-width'))||.18
                }))});
                this.on('tileunload', event => { for (const job of this.jobs.values()) if(job.canvas===event.tile){job.unloaded=true;this.worker?.postMessage({type:'cancel',id:job.id});this.jobs.delete(job.id);} });
            } catch { this.worker?.terminate(); this.worker = null; }
        }
    }

    candidates(x, y, width = 0, height = 0) {
        const records = new Set();
        for (let col = Math.floor(x / 64); col <= Math.floor((x + width) / 64); col++) {
            for (let row = Math.floor(y / 64); row <= Math.floor((y + height) / 64); row++) {
                for (const record of this.buckets.get(`${col},${row}`) || []) records.add(record);
            }
        }
        return [...records].filter(({ bounds: b }) => b.x <= x + width && b.x + b.width >= x && b.y <= y + height && b.y + b.height >= y)
            .sort((a, b) => a.order - b.order);
    }

    createTile(coords, done) {
        const key=`${coords.z}/${coords.x}/${coords.y}/${Math.min(2,window.devicePixelRatio||1)}`;
        const cached=done && this.tileCache.get(key);
        if(cached) {
            this.tileCache.delete(key);this.tileCache.set(key,cached);
            const tile=document.createElement('canvas');tile.width=cached.width;tile.height=cached.height;
            tile.getContext('2d').drawImage(cached,0,0);tile.dataset.renderer='cache';
            setTimeout(()=>done(null,tile),0);return tile;
        }
        if (!this.worker || !done) {
            const tile = this.paintTile(coords);
            if(done)this.rememberTile(key,tile);
            if (done) setTimeout(() => done(null,tile),0);
            return tile;
        }
        const canvas=document.createElement('canvas'),ratio=Math.min(2,window.devicePixelRatio||1);
        canvas.width=canvas.height=256*ratio;
        const id=++this.nextJob;
        this.jobs.set(id,{id,canvas,coords,done,key,revision:this.paintRevision});
        this.worker.postMessage({type:'tile',id,coords:{x:coords.x,y:coords.y,z:coords.z},ratio});
        return canvas;
    }

    redraw() {
        this.paintRevision++;this.tileCache.clear();this.cacheBytes=0;
        for(const id of this.jobs.keys())this.worker?.postMessage({type:'cancel',id});
        this.jobs.clear();
        this.worker?.postMessage({type:'colors',fills:this.records.map(r=>this.paintFill(r))});
        if(!this._map || !this._tiles)return super.redraw();
        // Keep the old visible image until its replacement is ready. GridLayer's
        // full redraw removes every tile at once, flashing an empty map during
        // each capture and event-camera animation.
        for(const tile of Object.values(this._tiles)) {
            const revision=this.paintRevision;
            this.createTile(tile.coords,(error,replacement)=>{
                if(error || revision!==this.paintRevision || !this._map)return;
                const ctx=tile.el.getContext('2d');
                ctx.clearRect(0,0,tile.el.width,tile.el.height);
                ctx.drawImage(replacement,0,0);
                if(!tile.loaded)this._tileReady(tile.coords,null,tile.el);
            });
        }
        return this;
    }

    rememberTile(key,canvas) {
        if(this.tileCache.has(key))this.cacheBytes-=this.tileCache.get(key).width*this.tileCache.get(key).height*4;
        this.tileCache.delete(key);this.tileCache.set(key,canvas);this.cacheBytes+=canvas.width*canvas.height*4;
        while(this.cacheBytes>32*1024*1024) {
            const oldest=this.tileCache.keys().next().value,tile=this.tileCache.get(oldest);
            this.cacheBytes-=tile.width*tile.height*4;this.tileCache.delete(oldest);
        }
    }

    paintFill(record) {
        const element = record.element;
        const fill = element.getAttribute('data-original-fill') || element.getAttribute('fill') || '#3b4650';
        const baseline = element.getAttribute('data-base-nation');
        // The country base already paints unchanged provinces. Keep their
        // geometry for picking, and paint only occupation colour overrides.
        return record.region && baseline && this.owner.nationColors?.[baseline]?.color === fill ? 'none' : fill;
    }

    onRemove(map) {
        this.tileCache.clear();this.cacheBytes=0;
        this.worker?.terminate(); this.worker=null; this.jobs.clear();
        for(const resolve of this.hitReplies?.values()||[])resolve(null);this.hitReplies?.clear();
        return super.onRemove(map);
    }

    paintTile(coords) {
        const tile = document.createElement('canvas');
        const ratio = Math.min(2, window.devicePixelRatio || 1), size = 256;
        tile.width = tile.height = size * ratio;
        const context = tile.getContext('2d');
        const scale = 2 ** coords.z, span = size / scale;
        const left = coords.x * span, top = coords.y * span + this.owner.svgHeight;
        const world = this.owner.svgWidth;
        const [originX, originY] = this.owner.svgOrigin || [0, 0];
        if (top + span < 0 || top > this.owner.svgHeight) return tile;
        for (let copy = Math.floor(left / world); copy <= Math.floor((left + span) / world); copy++) {
            const x = left - copy * world + originX;
            context.setTransform(scale * ratio, 0, 0, scale * ratio,
                ((copy * world - originX) * scale - coords.x * size) * ratio,
                (-(this.owner.svgHeight + originY) * scale - coords.y * size) * ratio);
            for (const record of this.candidates(x - 1 / scale, top + originY - 1 / scale, span + 2 / scale, span + 2 / scale)) {
                const element = record.element;
                const fill = this.paintFill(record);
                if (fill !== 'none') { record.path ||= new Path2D(element.getAttribute('d')); context.fillStyle = fill; context.fill(record.path, record.fillRule); }
                const stroke = record.region ? null : element.getAttribute('stroke');
                if (stroke && stroke !== 'none') {
                    record.path ||= new Path2D(element.getAttribute('d'));
                    context.strokeStyle = stroke; context.lineWidth = Number(element.getAttribute('stroke-width')) || .18;
                    context.stroke(record.path);
                }
            }
        }
        return tile;
    }

    regionAtAsync(latlng) {
        if(!this.worker)return Promise.resolve(this.regionAt(latlng));
        const [ox,oy]=this.owner.svgOrigin||[0,0];
        const x=ox+((latlng.lng%this.owner.svgWidth)+this.owner.svgWidth)%this.owner.svgWidth;
        const y=oy+this.owner.svgHeight-latlng.lat;
        this.hitReplies ||= new Map();
        const id=++this.nextJob;
        return new Promise(resolve=>{this.hitReplies.set(id,resolve);this.worker.postMessage({type:'hit',id,x,y});});
    }

    regionAt(latlng) {
        const [originX, originY] = this.owner.svgOrigin || [0, 0];
        const x = originX + ((latlng.lng % this.owner.svgWidth) + this.owner.svgWidth) % this.owner.svgWidth;
        const y = originY + this.owner.svgHeight - latlng.lat;
        return this.candidates(x, y).reverse().find(record => record.region &&
            this.hitContext.isPointInPath(record.path ||= new Path2D(record.element.getAttribute('d')), x, y, record.fillRule))?.element || null;
    }
}
