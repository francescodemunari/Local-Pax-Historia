function withinTurn(value,start,end) {
 if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const date=new Date(value+'T00:00:00Z');
 return Number.isFinite(+date) && date.toISOString().slice(0,10)===value && date>start && date<=end?value:null;
}
function atDay(start,days,total) {
 return new Date(+start+Math.max(1,Math.min(total,Math.ceil(days)))*86400000).toISOString().slice(0,10);
}
module.exports={withinTurn,atDay};
