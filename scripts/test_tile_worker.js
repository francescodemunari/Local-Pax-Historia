const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let sent, transforms=[],fills=[];
const worker={setTimeout:fn=>fn(),Path2D:class{constructor(d){this.d=d;}},OffscreenCanvas:class{
 constructor(width,height){assert([1,512].includes(width));assert.equal(height,width);}
 getContext(){return{setTransform(...t){transforms.push(t);},fill(path,rule){fills.push([path.d,rule,this.fillStyle]);},stroke(){},isPointInPath(path,x,y){return x===120 && y===230;}};}
 transferToImageBitmap(){return {mock:true};}
},postMessage:data=>{sent=data;}};
vm.createContext(worker);vm.runInContext(fs.readFileSync(require.resolve('../frontend/js/map-tile-worker.js'),'utf8'),worker);
worker.onmessage({data:{type:'init',width:360,height:180,origin:[100,200],records:[{order:0,bounds:{x:110,y:220,width:20,height:20},d:'province',fill:'#123456',fillRule:'evenodd',stroke:null}]}});
worker.onmessage({data:{type:'tile',id:1,coords:{x:0,y:-1,z:0},ratio:2}});
assert.equal(sent.id,1);assert(sent.bitmap);assert.deepEqual(fills,[['province','evenodd','#123456']]);
assert.deepEqual(transforms[0],[2,0,0,2,-200,-248]);
worker.onmessage({data:{type:'colors',fills:['#abcdef']}});fills=[];
worker.onmessage({data:{type:'tile',id:2,coords:{x:0,y:-1,z:0},ratio:2}});assert.equal(fills[0][2],'#abcdef');
console.log('✓ Background tile painting, coordinate origin, hole fill rules and recoloring passed');

worker.onmessage({data:{type:'init',width:360,height:180,origin:[100,200],records:[{order:0,region:true,bounds:{x:110,y:220,width:20,height:20},d:'province',fill:'none',fillRule:'evenodd',stroke:null}]}});
worker.onmessage({data:{type:'hit',id:3,x:120,y:230}});assert.equal(sent.type,'hit');assert.equal(sent.order,0,'Invisible province paint must remain selectable');
worker.onmessage({data:{type:'hit',id:4,x:500,y:230}});assert.equal(sent.order,-1);

// A camera movement can cancel obsolete work before it consumes worker time.
const tasks=[];worker.setTimeout=fn=>tasks.push(fn);
worker.onmessage({data:{type:'tile',id:50,coords:{x:0,y:-1,z:0},ratio:2}});
worker.onmessage({data:{type:'cancel',id:50}});
const last=sent;tasks.shift()();assert.equal(sent,last,'Cancelled tiles must not be rasterized');
worker.onmessage({data:{type:'tile',id:51,coords:{x:0,y:-1,z:0},ratio:2}});
worker.onmessage({data:{type:'tile',id:52,coords:{x:0,y:-1,z:0},ratio:2}});
tasks.shift()();assert.equal(sent.id,52,'Newest camera tiles are painted before the obsolete backlog');
