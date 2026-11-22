import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {synthetic,validate,measures,defaultConfig,haversine,output} from '../model.mjs';

const fixture=()=>validate(synthetic());
const by=(rows,id)=>rows.find(x=>x.id===id);
test('bundled fixture roundtrips and retains attribution',()=>{
  const doc=JSON.parse(fs.readFileSync(new URL('../data/demo.geojson',import.meta.url)));
  assert.deepEqual(validate(doc),fixture());assert.equal(doc.features.length,46);
  assert.equal(doc.metadata.origin,'synthetic');
});
test('WGS84: 0.009 degrees at equator is approximately one kilometre',()=>{
  assert.ok(Math.abs(haversine([0,0],[.009,0])-1000.75)<.1);
});
test('ground-truth proximity labels: equal near and far pairs',()=>{
  const fc=fixture();
  fc.features=fc.features.filter(x=>x.properties.kind==='district');
  const make=(id,kind,district,xy,extra)=>({type:'Feature',geometry:{type:'Point',coordinates:xy},properties:{id,kind,district,name:id,...extra}});
  fc.features.push(make('P','facility','A',[121.47,25.10],{category:'park'}));
  [[121.47,25.10],[121.4705,25.10],[121.471,25.101],[121.48,25.11],[121.492,25.10],[121.469,25.08]].forEach((xy,i)=>{
    fc.features.push(make('q'+i,'demand','A',xy,{demandWeight:1}));
  });
  const verified=validate(fc);
  const result=by(measures(verified),'A');
  assert.deepEqual(result.checks.map(x=>x.covered),[true,true,true,false,false,false]);
  assert.equal(result.uncovered,.5);
  assert.ok(Math.abs(result.score-(100*(.5*.6+(1-10000/37100/3)*.4)))<1e-9);
});
test('cross-boundary proximity counts nearest eligible facility, local supply is separate',()=>{
  const a=fixture();
  for(const f of a.features)if(f.properties.kind==='facility')f.properties.category='open';
  const near=a.features.find(x=>x.properties.id==='A-D2');
  const sport=a.features.find(x=>x.properties.id==='B-F1');
  sport.properties.category='sport';sport.geometry.coordinates=[...near.geometry.coordinates];
  const r=by(measures(a,defaultConfig,'sport'),'A');
  assert.equal(r.count,0);assert.equal(r.checks.find(c=>c.id==='A-D2').covered,true);
});
test('raising radius cannot increase uncovered ratio or score',()=>{
  const a=measures(fixture(),{...defaultConfig,radius:400}),b=measures(fixture(),{...defaultConfig,radius:900});
  for (const x of a){assert.ok(by(b,x.id).uncovered<=x.uncovered);assert.ok(by(b,x.id).score<=x.score);}
});
test('missing demand yields unranked instead of zero gap',()=>{
  const fc=fixture();fc.features=fc.features.filter(f=>f.properties.kind!=='demand'||f.properties.district!=='A');
  const a=by(measures(fc),'A');assert.equal(a.uncovered,null);assert.equal(a.score,null);
  assert.equal(output(fc,defaultConfig,'all','A').features[0].properties.rank,null);
});
test('rejects invalid import and strips unrelated attributes',()=>{
  const a=synthetic();a.features[1].properties.phone='sensitive';assert.equal(validate(a).features[1].properties.phone,undefined);
  const b=synthetic();b.features[0].geometry.coordinates[0][0]=[200,25];assert.throws(()=>validate(b),/無效數值/);
  const c=synthetic();c.features[1].properties.id='A';assert.throws(()=>validate(c),/ID 重複/);
  const d=synthetic();d.features[1].properties.district='unknown';assert.throws(()=>validate(d),/未知分區/);
});
test('analysis exports selected district, config and limitation without destructive input changes',()=>{
  const a=fixture(),r=output(a,defaultConfig,'sport','B');assert.equal(r.features.length,1);
  assert.equal(r.features[0].properties.id,'B');assert.equal(r.metadata.analysis.radius,700);
  assert.match(r.metadata.analysis.limit,/不是步行/);assert.equal(a.features.length,46);
});
