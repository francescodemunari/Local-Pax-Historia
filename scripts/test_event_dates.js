const assert=require('node:assert/strict');
const {withinTurn,atDay}=require('../backend/services/event-dates');
const start=new Date('1936-01-01'),end=new Date('1936-02-01');
assert.equal(withinTurn('1936-01-12',start,end),'1936-01-12');
for(const value of ['1936-02-30','1935-12-31','1936-01-01','not a date'])assert.equal(withinTurn(value,start,end),null);
assert.equal(atDay(start,8,31),'1936-01-09');assert.equal(atDay(start,90,31),'1936-02-01');
console.log('Event dates are valid and bounded by the simulated interval');
