/* Tile painting is isolated from pointer handling and camera animation. */
let records = [], buckets = new Map(), world, height, origin;
let hitBuckets=new Map(),hitContext;
function rebuildPaintIndex() {
    buckets = new Map();
    for (const r of records) {
        if(r.fill==='none' && (!r.stroke || r.stroke==='none'))continue;
        for(let x=Math.floor(r.bounds.x/64);x<=Math.floor((r.bounds.x+r.bounds.width)/64);x++)
            for(let y=Math.floor(r.bounds.y/64);y<=Math.floor((r.bounds.y+r.bounds.height)/64);y++) {
                const key=`${x},${y}`;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(r);
            }
    }
}
function nearby(x, y, width, height) {
    const found = new Set();
    for (let col=Math.floor(x/64); col<=Math.floor((x+width)/64); col++)
        for (let row=Math.floor(y/64); row<=Math.floor((y+height)/64); row++)
            for (const record of buckets.get(`${col},${row}`)||[]) found.add(record);
    return [...found].filter(r=>r.bounds.x<=x+width && r.bounds.x+r.bounds.width>=x && r.bounds.y<=y+height && r.bounds.y+r.bounds.height>=y).sort((a,b)=>a.order-b.order);
}
const tileQueue=new Map();let painting=false;
function scheduleTile() {
 if(painting || !tileQueue.size)return;painting=true;
 setTimeout(()=>{const id=[...tileQueue.keys()].at(-1),data=tileQueue.get(id);tileQueue.delete(id);if(data)paint(data);painting=false;scheduleTile();},0);
}
onmessage = ({data}) => {
 if(data.type==='cancel'){tileQueue.delete(data.id);return;}
 if(data.type==='tile'){tileQueue.set(data.id,data);scheduleTile();return;}
 handle(data);
};
function handle(data) {
    if (data.type === 'init') {
        world=data.width; height=data.height; origin=data.origin;
        records=data.records.map(r=>({...r,path:null}));
        hitBuckets=new Map();hitContext=new OffscreenCanvas(1,1).getContext('2d');
        for(const r of records)if(r.region)for(let x=Math.floor(r.bounds.x/64);x<=Math.floor((r.bounds.x+r.bounds.width)/64);x++)
            for(let y=Math.floor(r.bounds.y/64);y<=Math.floor((r.bounds.y+r.bounds.height)/64);y++) {
                const key=`${x},${y}`;if(!hitBuckets.has(key))hitBuckets.set(key,[]);hitBuckets.get(key).push(r);
            }
        rebuildPaintIndex();
        return;
    }
    if (data.type === 'colors') { data.fills.forEach((fill,i)=>records[i].fill=fill); rebuildPaintIndex(); return; }
    if(data.type==='hit') {
        const candidates=hitBuckets.get(`${Math.floor(data.x/64)},${Math.floor(data.y/64)}`)||[];
        let hit;
        for(let i=candidates.length-1;i>=0;i--){const r=candidates[i];if(data.x>=r.bounds.x && data.x<=r.bounds.x+r.bounds.width && data.y>=r.bounds.y && data.y<=r.bounds.y+r.bounds.height && hitContext.isPointInPath(r.path ||= new Path2D(r.d),data.x,data.y,r.fillRule)){hit=r;break;}}
        postMessage({type:'hit',id:data.id,order:hit?.order ?? -1});return;
    }
}
function paint(data) {
    try {
        const {x,y,z}=data.coords, ratio=data.ratio, size=256, scale=2**z,span=size/scale;
        const canvas=new OffscreenCanvas(size*ratio,size*ratio),ctx=canvas.getContext('2d');
        const left=x*span,top=y*span+height;
        if(top+span>=0 && top<=height) for(let copy=Math.floor(left/world);copy<=Math.floor((left+span)/world);copy++) {
            ctx.setTransform(scale*ratio,0,0,scale*ratio,((copy*world-origin[0])*scale-x*size)*ratio,(-(height+origin[1])*scale-y*size)*ratio);
            for(const r of nearby(left-copy*world+origin[0]-1/scale,top+origin[1]-1/scale,span+2/scale,span+2/scale)) {
                if(r.fill==='none' && (!r.stroke || r.stroke==='none')) continue;
                r.path ||= new Path2D(r.d);
                if(r.fill!=='none'){ctx.fillStyle=r.fill;ctx.fill(r.path,r.fillRule);}
                if(r.stroke && r.stroke!=='none'){ctx.strokeStyle=r.stroke;ctx.lineWidth=r.strokeWidth;ctx.stroke(r.path);}
            }
        }
        const bitmap=canvas.transferToImageBitmap();postMessage({id:data.id,bitmap},[bitmap]);
    } catch(error) { postMessage({id:data.id,error:error.message}); }
};
