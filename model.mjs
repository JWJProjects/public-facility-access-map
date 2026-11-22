export const categories={park:'公園綠地',sport:'公共運動',open:'開放空間'};
export const defaultConfig={radius:700,target:3,weight:60};
const point=(id,x,y,properties)=>({type:'Feature',geometry:{type:'Point',coordinates:[x,y]},properties:{id,...properties}});
export const synthetic=()=>{
  const rows=[
    ['A','北岸',121.478,25.102,37100,[['park',-.002,.002],['sport',.005,.002],['open',-.006,-.003],['park',.005,-.004],['sport',-.005,.002]]],
    ['B','東丘',121.498,25.102,47200,[['park',-.006,.003],['sport',.006,-.004],['park',.003,.005]]],
    ['C','河心',121.478,25.088,59000,[['park',.006,.004],['open',.007,-.005]]],
    ['D','新街',121.498,25.088,53200,[['park',-.004,.003],['sport',.005,.002],['open',-.003,-.004],['sport',.002,-.005],['open',.007,-.003],['park',-.005,-.002]]],
    ['E','南港灣',121.478,25.074,21100,[['park',-.005,.003],['sport',.003,.002],['open',.006,-.002],['park',-.002,-.005]]],
    ['F','南埕',121.498,25.074,44900,[['open',-.007,-.003],['park',-.006,.004]]]
  ];
  const features=[];
  rows.forEach(([id,name,x,y,pop,fs])=>{
    const ring=[[x-.010,y-.007],[x+.010,y-.007],[x+.010,y+.007],[x-.010,y+.007],[x-.010,y-.007]];
    features.push({type:'Feature',properties:{id,kind:'district',name,population:pop},geometry:{type:'Polygon',coordinates:[ring]}});
    [[-.006,-.004,31],[.000,.001,45],[.006,.004,24]].forEach(([dx,dy,w],i)=>features.push(point(`${id}-D${i+1}`,x+dx,y+dy,{kind:'demand',district:id,name:`${name}需求點 ${i+1}`,demandWeight:w})));
    fs.forEach(([category,dx,dy],i)=>features.push(point(`${id}-F${i+1}`,x+dx,y+dy,{kind:'facility',district:id,category,name:`${name}${categories[category]} ${i+1}`})));
  });
  return {type:'FeatureCollection',metadata:{name:'六區合成示範',origin:'synthetic',source:'專案內建可重現合成情境；不代表真實地理或營運',license:'CC0-1.0',version:'1.0'},features};
};
const bad=m=>{throw new Error(m);};
const str=(v,label,max=120)=>typeof v==='string'&&v.trim()&&v.length<=max?v.trim():bad(`缺少或不合法：${label}`);
const number=(v,label,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max?v:bad(`無效數值：${label}`);
const coord=v=>Array.isArray(v)&&v.length===2?[number(v[0],'經度',-180,180),number(v[1],'緯度',-85,85)]:bad('座標須為 [經度, 緯度] (WGS84)');
export function validate(fc){
  if(!fc||fc.type!=='FeatureCollection'||!Array.isArray(fc.features)||!fc.features.length||fc.features.length>2500) bad('需要 1–2,500 筆 GeoJSON FeatureCollection');
  if(fc.crs) bad('請先轉換為 WGS84 經緯度；不接受自訂 CRS');
  const m=fc.metadata||{};
  const metadata={name:str(m.name,'metadata.name'),origin:str(m.origin,'metadata.origin'),source:str(m.source,'metadata.source',500),license:str(m.license,'metadata.license'),version:str(m.version,'metadata.version')};
  if(!['synthetic','official-open','user-provided'].includes(metadata.origin)) bad('無效 metadata.origin');
  const ids=new Set();
  const features=fc.features.map((f)=>{
    if(!f||f.type!=='Feature'||!f.properties||!f.geometry) bad('每筆須為完整 Feature');
    const p=f.properties,id=str(p.id,'id',80),name=str(p.name,'name'),kind=p.kind,g=f.geometry;
    if(ids.has(id)) bad(`ID 重複：${id}`); ids.add(id);
    if(kind==='district'){
      if(g.type!=='Polygon'||!Array.isArray(g.coordinates)||g.coordinates.length!==1||!Array.isArray(g.coordinates[0])||g.coordinates[0].length<4||g.coordinates[0].length>300) bad('分區須為單一、無內洞 Polygon');
      const ring=g.coordinates[0].map(coord);
      if(ring[0].some((v,i)=>v!==ring[ring.length-1][i])||new Set(ring.slice(0,-1).map(x=>x.join(','))).size<3) bad('分區邊界須閉合，且至少 3 個不同頂點');
      const signed=ring.slice(0,-1).reduce((s,[x,y],i)=>s+x*ring[i+1][1]-ring[i+1][0]*y,0);
      if(Math.abs(signed)<1e-12) bad('分區面積須非零');
      return {type:'Feature',geometry:{type:'Polygon',coordinates:[ring]},properties:{id,name,kind,population:number(p.population,'population',1,1e9)}};
    }
    if(g.type!=='Point') bad('設施／需求須為 Point');
    const district=str(p.district,'district',80),coordinates=coord(g.coordinates);
    if(kind==='facility'&&Object.prototype.hasOwnProperty.call(categories,p.category)) return {type:'Feature',geometry:{type:'Point',coordinates},properties:{id,name,kind,district,category:p.category}};
    if(kind==='demand') return {type:'Feature',geometry:{type:'Point',coordinates},properties:{id,name,kind,district,demandWeight:number(p.demandWeight,'demandWeight',.001,1e9)}};
    bad('kind 或設施 category 不支援');
  });
  const districts=new Set(features.filter(f=>f.properties.kind==='district').map(f=>f.properties.id));
  if(!districts.size||districts.size>40) bad('需 1–40 個分區');
  features.forEach(f=>{const p=f.properties;if(p.kind!=='district'&&!districts.has(p.district))bad(`未知分區：${p.district}`);});
  return {type:'FeatureCollection',metadata,features};
}
export function haversine(a,b) {
  const f=Math.PI/180, dp=(b[1]-a[1])*f, dl=(b[0]-a[0])*f;
  const h=Math.sin(dp/2)**2+Math.cos(a[1]*f)*Math.cos(b[1]*f)*Math.sin(dl/2)**2;
  return 12742000*Math.asin(Math.min(1,Math.sqrt(h)));
}
export function measures(fc,config=defaultConfig,category='all'){
  const parts=k=>fc.features.filter(f=>f.properties.kind===k);
  const available=parts('facility').filter(f=>category==='all'||f.properties.category===category);
  const demand=parts('demand'), {radius,target,weight}=config;
  const opportunities=parts('district').map(d=>{
    const p=d.properties, facilities=available.filter(f=>f.properties.district===p.id), sites=demand.filter(f=>f.properties.district===p.id);
    const checks=sites.map(s=>{
      const distance=available.reduce((m,f)=>Math.min(m,haversine(s.geometry.coordinates,f.geometry.coordinates)),Infinity);
      return {id:s.properties.id,distance:Number.isFinite(distance)?distance:null,covered:distance<=radius,weight:s.properties.demandWeight};
    });
    const total=checks.reduce((s,p)=>s+p.weight,0);
    const uncovered=total?checks.reduce((s,p)=>s+(p.covered?0:p.weight),0)/total:null;
    const density=facilities.length*10000/p.population, shortage=Math.max(0,1-density/target);
    return {id:p.id,name:p.name,population:p.population,count:facilities.length,sites:sites.length,density,uncovered,shortage,score:uncovered===null?null:100*(uncovered*weight/100+shortage*(1-weight/100)),checks};
  });
  return opportunities.sort((a,b)=>(b.score??-1)-(a.score??-1)||a.id.localeCompare(b.id));
}
export function output(fc,config,category,area='all'){
  const rows=measures(fc,config,category);
  const byId=new Map(rows.map((r,i)=>[r.id,{...r,r:r.score===null?null:i+1}]));
  const rnd=v=>v===null?null:Number(v.toFixed(3));
  return {type:'FeatureCollection',metadata:{...fc.metadata,analysis:{method:'provision-proximity-v1',...config,category,area,limit:'圓半徑直線近接代理，不是步行、無障礙或服務品質評估'}},features:fc.features.filter(f=>f.properties.kind==='district'&&(area==='all'||f.properties.id===area)).map(f=>{
    const r=byId.get(f.properties.id);
    return {...f,properties:{...f.properties,rank:r.r,facilityCount:r.count,facilityPer10000:rnd(r.density),uncoveredRatio:rnd(r.uncovered),shortageRatio:rnd(r.shortage),priorityScore:rnd(r.score)}};
  })};
}
