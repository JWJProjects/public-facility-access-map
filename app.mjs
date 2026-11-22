import {categories,defaultConfig,synthetic,validate,measures,output,haversine} from './model.mjs';
const $=s=>document.querySelector(s);
const html=v=>String(v).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const pct=v=>v===null?'缺資料':Math.round(100*v)+'%';
const fmt=v=>v===null?'—':v.toFixed(1);
const int=v=>v.toLocaleString('zh-TW');
let fc=validate(synthetic()), config={...defaultConfig}, category='all', area='all', base='A', focused=null, rows=[];
let timer;
const features=(kind)=>fc.features.filter(f=>f.properties.kind===kind);
const districts=()=>features('district');
const options=(items)=>items.map(([id,name])=>'<option value="'+html(id)+'">'+html(name)+'</option>').join('');
const file=(name,data)=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/geo+json'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
};
const notify=msg=>{clearTimeout(timer);$('#toast').hidden=false;$('#toast').textContent=msg;timer=setTimeout(()=>$('#toast').hidden=true,3300);};
function initSelect(){
  const opts=districts().map(f=>[f.properties.id,f.properties.name]);
  $('#area').innerHTML=options([['all','全區'],...opts]);
  $('#baseline').innerHTML=options(opts);$('#baseline').value=base=opts[0][0];
  area='all';focused=null;
}
const mobile=()=>matchMedia('(max-width:850px)').matches;
function switchPanel(panel){
  $('#main').dataset.panel=panel;
  document.querySelectorAll('[data-panel-target]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.panelTarget===panel)));
}
function linkHover(el,selector){
  const sync=()=>[...document.querySelectorAll(selector)].find(other=>other.dataset.id===el.dataset.id);
  for(const event of ['mouseenter','focus'])el.addEventListener(event,()=>sync()?.classList.add('linked'));
  for(const event of ['mouseleave','blur'])el.addEventListener(event,()=>sync()?.classList.remove('linked'));
}
function setFocus(id,origin){
  focused=id;if(origin==='map'&&mobile())switchPanel('summary');
  render();
  const rank=[...document.querySelectorAll('.rankrow')].find(el=>el.dataset.id===id);
  const map=[...document.querySelectorAll('.district')].find(el=>el.dataset.id===id);
  (origin==='map'?map:rank)?.focus({preventScroll:true});
  if(rank&&!mobile()){
    const box=$('#rank'),r=rank.getBoundingClientRect(),b=box.getBoundingClientRect();
    if(r.top<b.top || r.bottom>b.bottom)box.scrollTop+=r.top-b.top;
  }
}
function drawMap(focus){
  const map=$('#map'), ds=districts(), dsVisible=area==='all'?ds:ds.filter(d=>d.properties.id===area);
  const showSet=new Set(dsVisible.map(d=>d.properties.id));
  const points=dsVisible.flatMap(d=>d.geometry.coordinates[0]);
  const xs=points.map(a=>a[0]),ys=points.map(a=>a[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),midY=(maxY+minY)/2,midX=(maxX+minX)/2;
  const w=map.clientWidth||390,h=map.clientHeight||300,small=w<=850;
  const left=small?18:w<=1120?220:274,right=small?w-18:w<=1120?w-286:w-345;
  const top=small?29:88,bottom=h-(small?51:90),c=Math.max(.00000001,Math.cos(midY*Math.PI/180));
  const scale=Math.min((right-left)/Math.max(.00000001,(maxX-minX)*c),(bottom-top)/Math.max(.00000001,maxY-minY));
  const xy=([x,y])=>[(left+right)/2+(x-midX)*c*scale,(top+bottom)/2-(y-midY)*scale];
  const dpts=features('demand').filter(f=>showSet.has(f.properties.district));
  const fpts=features('facility').filter(f=>showSet.has(f.properties.district)&&(category==='all'||category===f.properties.category));
  const flags=new Map(rows.flatMap(r=>r.checks.map(x=>[x.id,x.covered])));
  const poly=dsVisible.map(d=>{
    const p=d.properties, pts=d.geometry.coordinates[0].map(xy), xx=pts.map(a=>a[0]),yy=pts.map(a=>a[1]);
    const x=(Math.max(...xx)+Math.min(...xx))/2,y=Math.min(...yy)+(small?17:24);
    const score=rows.find(r=>r.id===p.id)?.score??null;
    const grade=score===null?null:score>=70?4:score>=50?3:score>=35?2:score>=20?1:0;
    const fill=grade===null?'url(#unknown-hatch)':'var(--score-'+grade+')';
    const ps=pts.map(v=>v.join(',')).join(' ');
    return '<g class="district '+(p.id===focus?'selected':'')+'" tabindex="0" role="button" aria-label="'+html(p.name)+'，查看指標" aria-pressed="'+(p.id===focus)+'" data-id="'+html(p.id)+'"><polygon class="shape" fill="'+fill+'" points="'+ps+'"/><polygon class="selection" points="'+ps+'"/><title>'+html(p.name)+'：'+(score===null?'資料不足':fmt(score)+' 分')+'</title><text class="map-label" x="'+x+'" y="'+y+'">'+html(p.name)+'</text><text class="map-score" x="'+x+'" y="'+(y+(small?12:15))+'">'+(score===null?'資料不足':fmt(score)+' 分')+'</text></g>';
  }).join('');
  const spots=dpts.map(f=>{
    const [x,y]=xy(f.geometry.coordinates),ok=flags.get(f.properties.id),r=small?3.2:4.6;
    return '<g pointer-events="none"><circle cx="'+x+'" cy="'+y+'" r="'+r+'" class="originmark"><title>'+html(f.properties.name)+'：'+(ok?'半徑內有設施':'半徑內無設施')+'</title></circle>'+(ok?'':'<path d="M'+(x-r+1)+' '+(y+r-1)+'l'+(2*r-2)+' '+(-2*r+2)+'" stroke="#283846" stroke-width="1.2"/>')+'</g>';
  }).join('');
  const dots=fpts.map(f=>{
    const p=f.properties,[x,y]=xy(f.geometry.coordinates), r=small?4.3:6,c='var(--feature-'+p.category+')',title='<title>'+html(p.name)+'，'+categories[p.category]+'</title>';
    const dot='<circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="'+c+'" stroke="#fff" stroke-width="1.3"'+(p.category==='park'?'':' opacity="0" aria-hidden="true"')+'>'+title+'</circle>';
    const symbol=p.category==='sport'?'<path d="M'+x+' '+(y-r)+'l'+r+' '+(2*r)+'h'+(-2*r)+'z" fill="'+c+'" stroke="#fff" stroke-width="1.1">'+title+'</path>':p.category==='open'?'<rect x="'+(x-r*.8)+'" y="'+(y-r*.8)+'" width="'+(r*1.6)+'" height="'+(r*1.6)+'" fill="'+c+'" stroke="#fff" stroke-width="1.1">'+title+'</rect>':'';
    return '<g class="point-icon">'+dot+symbol+'</g>';
  }).join('');
  const per=haversine([midX,midY],[Math.min(180,midX+1/(scale*c)),midY]);
  const alt=per>0?per:haversine([midX,midY],[midX,Math.min(90,midY+1/scale)]);
  const raw=Math.max(.1,alt)*(small?71:116), exp=10**Math.floor(Math.log10(raw)), ratio=raw/exp, dist=(ratio>=5?5:ratio>=2?2:1)*exp;
  const len=dist/Math.max(0.1,alt),nice=dist>=1000?dist/1000+' km':dist+' m',hx=left+8,hy=h-(small?15:57);
  const nx=right-6,ny=small?23:38;
  map.innerHTML='<svg viewBox="0 0 '+w+' '+h+'" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="可用鍵盤選取的分區設施地圖"><defs><pattern id="selection-hatch" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M-2 2l4 -4M0 8l8 -8M6 10l4 -4" fill="none" stroke="#0b57d0" stroke-opacity=".44" stroke-width="1.25"/></pattern><pattern id="unknown-hatch" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#e1e4e0"/><path d="M0 7L7 0" stroke="#979c97" stroke-width="1"/></pattern></defs>'+poly+spots+dots+'<g class="gis-north" aria-label="北方"><text class="map-foot" x="'+nx+'" y="'+(ny-10)+'" text-anchor="middle">N</text><path d="M'+nx+' '+(ny+17)+'v-22l-5 9m5-9 5 9"/></g><g class="gis-scale"><path d="M'+hx+' '+(hy-5)+'v5h'+len+'v-5 M'+(hx+len/2)+' '+(hy-4)+'v4"/><text class="map-foot" x="'+hx+'" y="'+(hy-9)+'">約 '+nice+'</text></g></svg>';
  document.querySelectorAll('.district').forEach(el=>{
    el.addEventListener('click',()=>setFocus(el.dataset.id,'map'));
    el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setFocus(el.dataset.id,'map')}});
    linkHover(el,'.rankrow');
  });
  const levels=['0–<20','20–<35','35–<50','50–<70','70–100'];
  const names=[...Object.keys(categories).map(k=>[k,categories[k]]),['demand','需求點'],['selected','已選分區'],['unsure','資料不足']];
  $('#legend').innerHTML='<div><div class="legend-heading">缺口級距 <span>優先分數</span></div><div class="legend-stops" aria-hidden="true">'+levels.map((_,n)=>'<b style="--swatch:var(--score-'+n+')"></b>').join('')+'</div><div class="legend-labels">'+levels.map(t=>'<span>'+html(t)+'</span>').join('')+'</div></div><div class="legend-features">'+names.map(([k,v])=>'<span><i class="sym-'+k+'" aria-hidden="true"></i>'+v+'</span>').join('')+'</div>';
}
function render(){
  rows=measures(fc,config,category);
  const visible=rows.filter(r=>area==='all'||r.id===area);
  const f=visible.find(r=>r.id===focused)||visible[0];
  focused=f?.id??null;
  const allChecks=visible.flatMap(r=>r.checks);
  const demand=allChecks.reduce((s,p)=>s+p.weight,0);
  const uncovered=demand?allChecks.reduce((s,p)=>s+(p.covered?0:p.weight),0)/demand:null;
  const count=visible.reduce((s,r)=>s+r.count,0);
  const cards=[['分析範圍',visible.length+' 區',area==='all'?'全區比較':'依所選分區顯示'],['有效設施',count+' 處',category==='all'?'三類設施加總':categories[category]],['需求權重未近接',pct(uncovered),'以 '+config.radius+' m 直線半徑衡量'],['最高優先分數',fmt(visible[0]?.score??null),visible[0]?.score===null?'需求資料不足':(visible[0]?.name??'—')+' / 非可達性指標']];
  $('#kpis').innerHTML=cards.map(([t,v,d])=>'<div class="kpi"><div class="label">'+t+'</div><strong>'+v+'</strong><p>'+html(d)+'</p></div>').join('');
  $('#source-tag').textContent=fc.metadata.origin==='synthetic'?'合成示範資料':fc.metadata.origin==='official-open'?'匯入資料・自報開放來源':'匯入資料';
  $('#map-badge').textContent=fc.metadata.origin==='synthetic'?'合成圖資・非底圖':'匯入圖資・非底圖';
  drawMap(focused);
  $('#rank').innerHTML=visible.map((r,i)=>'<button class="rankrow" data-id="'+html(r.id)+'" aria-pressed="'+(r.id===focused)+'"><small>'+String(rows.indexOf(r)+1).padStart(2,'0')+'</small><div><strong>'+html(r.name)+'</strong><div class="rail"><i style="width:'+(r.score??0)+'%"></i></div></div><span class="score">'+fmt(r.score)+'</span></button>').join('');
  document.querySelectorAll('.rankrow').forEach(el=>{el.addEventListener('click',()=>setFocus(el.dataset.id,'rank'));linkHover(el,'.district')});
  $('#detail').innerHTML=f?'<div class="detail"><div class="detail-head"><div><small>已選分區</small><div class="detail-name">'+html(f.name)+'</div></div><div><strong>'+fmt(f.score)+'</strong><small> 分</small></div></div><p>分數拆解｜'+f.count+' 處設施・'+f.sites+' 個需求點</p><div class="contributions"><div class="measure">供給缺口<strong>'+pct(f.shortage)+'</strong><span>占權重 '+(100-config.weight)+'%</span></div><div class="measure">近接缺口<strong>'+pct(f.uncovered)+'</strong><span>占權重 '+config.weight+'%</span></div></div><p class="detail-explain">每萬人 '+fmt(f.density)+' 處。分數不是可達性指標。</p></div>':'';
  const baseline=rows.find(r=>r.id===base);
  const diff=r=>r.score===null||baseline?.score===null||!baseline?'—':((r.score-baseline.score>0?'+':'')+(r.score-baseline.score).toFixed(1));
  $('#compare-note').textContent=baseline?'以 '+baseline.name+' 為基準標記；全區比較保留並可與地圖範圍分開使用。':'選取比較基準。';
  $('#comparison').innerHTML=rows.map(r=>'<tr class="'+(r.id===base?'row-baseline':'')+'"><th scope="row">'+html(r.name)+(r.id===base?'（基準）':'')+'</th><td>'+int(r.population)+'</td><td>'+r.count+'</td><td>'+fmt(r.density)+'</td><td>'+pct(r.uncovered)+'</td><td>'+fmt(r.score)+'</td><td>'+diff(r)+'</td></tr>').join('');
  $('#provenance').innerHTML=Object.entries({資料:fc.metadata.name,來源:fc.metadata.source,類型:fc.metadata.origin,版本:fc.metadata.version,授權:fc.metadata.license}).map(([k,v])=>'<dt>'+k+'</dt><dd>'+html(v)+'</dd>').join('');
}
$('#category').addEventListener('change',e=>{category=e.target.value;focused=null;render()});
$('#area').addEventListener('change',e=>{area=e.target.value;focused=null;render()});
$('#baseline').addEventListener('change',e=>{base=e.target.value;render()});
for(const [button,dialog,prepare] of [['#open-data','#data-dialog'],['#settings','#config-dialog',()=>showConfig(config)]]){
  $(button).addEventListener('click',()=>{prepare?.();$(dialog).showModal()});
  $(dialog).addEventListener('close',()=>$(button).focus({preventScroll:true}));
}
document.querySelectorAll('[data-close]').forEach(e=>e.addEventListener('click',()=>e.closest('dialog').close()));
const showConfig=c=>{for(const k of Object.keys(c))$('#'+k).value=c[k];preview()};
function preview(){const w=Number($('#weight').value);$('#preview-score').textContent='評分：近接缺口 × '+w+'% ＋ 供給缺口 × '+(100-w)+'%';}
$('#weight').addEventListener('input',preview);
$('#reset-config').addEventListener('click',()=>showConfig(defaultConfig));
$('#config-form').addEventListener('submit',e=>{
  e.preventDefault();if(!e.target.reportValidity())return;
  config=Object.fromEntries(Object.keys(defaultConfig).map(k=>[k,$('#'+k).valueAsNumber]));
  $('#config-dialog').close();focused=null;render();notify('已更新評分參數');
});
$('#file').addEventListener('change',async(e)=>{
  const f=e.target.files[0],status=$('#import-state'); if(!f)return;
  try{if(f.size>2_000_000)throw new Error('檔案超過 2 MB');
    const validated=validate(JSON.parse(await f.text())); fc=validated;initSelect();render();
    status.className='';status.textContent='匯入成功：'+fc.features.length+' 筆，分析已更新。';
  } catch(err) {status.className='error';status.textContent='未匯入，保留原資料。'+err.message;}
  e.target.value='';
});
$('#reset-data').addEventListener('click',()=>{fc=validate(synthetic());initSelect();render();$('#import-state').className='';$('#import-state').textContent='已還原合成示範資料。'});
$('#export').addEventListener('click',()=>{file('facility-gap-analysis.geojson',output(fc,config,category,area));notify('已匯出目前分析範圍')});
$('#export-input').addEventListener('click',()=>file('facility-input.geojson',fc));
document.querySelectorAll('[data-panel-target]').forEach(b=>b.addEventListener('click',()=>switchPanel(b.dataset.panelTarget)));
$('#toggle-inspector').addEventListener('click',e=>{
  const collapsed=$('.inspector').toggleAttribute('data-collapsed');
  e.currentTarget.setAttribute('aria-expanded',String(!collapsed));e.currentTarget.textContent=collapsed?'展開':'收合';
});
initSelect();render();
let drawnSize='';
new ResizeObserver(()=>{requestAnimationFrame(()=>{
  const map=$('#map'), size=map.clientWidth+':'+map.clientHeight;
  if(size!==drawnSize){drawnSize=size;const prev=document.activeElement?.closest('.district')?.dataset.id;drawMap(focused);if(prev)[...map.querySelectorAll('.district')].find(el=>el.dataset.id===prev)?.focus({preventScroll:true});}
})}).observe($('#map'));
