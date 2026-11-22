import {categories,defaultConfig,synthetic,validate,measures,output,haversine} from './model.mjs';
const $=s=>document.querySelector(s);
const html=v=>String(v).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const pct=v=>v===null?'缺資料':Math.round(100*v)+'%';
const fmt=v=>v===null?'—':v.toFixed(1);
const int=v=>v.toLocaleString('zh-TW');
const colors={park:'#257762',sport:'#445fc4',open:'#ad532f'};
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
function setFocus(id,origin){
  focused=id;render();
  const list=origin==='map'?document.querySelectorAll('.district'):document.querySelectorAll('.rankrow');
  [...list].find(el=>el.dataset.id===id)?.focus({preventScroll:true});
}
function drawMap(focus){
  const ds=districts(), dsVisible=area==='all'?ds:ds.filter(d=>d.properties.id===area);
  const showSet=new Set(dsVisible.map(d=>d.properties.id));
  const points=dsVisible.flatMap(d=>d.geometry.coordinates[0]);
  const xs=points.map(a=>a[0]),ys=points.map(a=>a[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),midY=(maxY+minY)/2,midX=(maxX+minX)/2;
  const c=Math.cos(midY*Math.PI/180), scale=Math.min(600/Math.max(.00000001,(maxX-minX)*c),294/Math.max(.00000001,maxY-minY));
  const xy=([x,y])=>[345+(x-midX)*c*scale,179-(y-midY)*scale];
  const dpts=features('demand').filter(f=>showSet.has(f.properties.district));
  const fpts=features('facility').filter(f=>showSet.has(f.properties.district)&&(category==='all'||category===f.properties.category));
  const flags=new Map(rows.flatMap(r=>r.checks.map(x=>[x.id,x.covered])));
  const poly=dsVisible.map(d=>{
    const p=d.properties, ring=d.geometry.coordinates[0], pts=ring.map(xy);
    const xx=pts.map(a=>a[0]), yy=pts.map(a=>a[1]);
    const x=(Math.max(...xx)+Math.min(...xx))/2,y=Math.min(...yy)+18;
    const row=rows.find(r=>r.id===p.id), score=row?.score;
    const fill=score===null?'#e6ebea':score>=50?'#e8ad8a':score>=35?'#f3cfaf':score>=20?'#f6e4bd':'#cfe5d2';
    return '<g class="district '+(p.id===focus?'selected':'')+'" tabindex="0" role="button" aria-label="'+html(p.name)+'，查看指標" data-id="'+html(p.id)+'"><polygon class="shape" fill="'+fill+'" points="'+pts.map(v=>v.join(',')).join(' ')+'"/><text class="map-label" x="'+x+'" y="'+y+'" text-anchor="middle">'+html(p.name)+'</text></g>';
  }).join('');
  const spots=dpts.map(f=>{const [x,y]=xy(f.geometry.coordinates),ok=flags.get(f.properties.id);return '<circle cx="'+x+'" cy="'+y+'" r="5" fill="#fff" opacity=".9" stroke="'+(ok?'#4d776a':'#8c3e22')+'" stroke-width="2" pointer-events="none"><title>'+html(f.properties.name)+'：'+(ok?'半徑內有設施':'半徑內無設施')+'</title></circle>';}).join('');
  const dots=fpts.map(f=>{const p=f.properties,[x,y]=xy(f.geometry.coordinates);return '<circle cx="'+x+'" cy="'+y+'" r="5.8" fill="'+colors[p.category]+'" stroke="#fff" stroke-width="1.5"><title>'+html(p.name)+'，'+categories[p.category]+'</title></circle>';}).join('');
  const metres=haversine([midX,midY],[midX+100/(scale*c),midY]), nice=metres>=1000?Math.round(metres/1000)+' km':Math.max(1,Math.round(metres))+' m';
  $('#map').innerHTML='<svg viewBox="0 0 690 358" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="可用鍵盤選取的分區設施地圖"><defs><pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M 25 0 L 0 0 0 25" fill="none" stroke="#bfd5cb" stroke-width=".7"/></pattern></defs><rect width="690" height="358" fill="url(#grid)"/>'+poly+spots+dots+'<g stroke="#235b54" fill="#235b54" opacity=".8"><path d="M656 55 V30 l-4 6 m4-6 4 6" fill="none" stroke-width="2"/><text x="656" y="24" text-anchor="middle" stroke="none" font-size="12">N</text><path d="M18 337 v5 H118 v-5" fill="none" stroke-width="1.5"/><text x="18" y="332" stroke="none" font-size="11">約 '+nice+'</text></g></svg>';
  document.querySelectorAll('.district').forEach(el=>{
    el.addEventListener('click',()=>setFocus(el.dataset.id,'map'));
    el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setFocus(el.dataset.id,'map')}});
  });
  $('#legend').innerHTML=Object.keys(categories).map(k=>'<span><i style="background:'+colors[k]+'"></i>'+categories[k]+'</span>').join('')+'<span><i style="border:2px solid #8c3e22"></i>需求點</span><span><i style="background:#e8ad8a"></i>50 分以上</span>';
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
  document.querySelectorAll('.rankrow').forEach(el=>el.addEventListener('click',()=>setFocus(el.dataset.id,'rank')));
  $('#detail').innerHTML=f?'<div class="detail"><b>'+html(f.name)+'｜分數拆解</b><p>供給缺口 '+pct(f.shortage)+' × '+(100-config.weight)+'% ＋ 近接缺口 '+pct(f.uncovered)+' × '+config.weight+'%</p><p>'+f.count+' 處設施・'+f.sites+' 個需求點・每萬人 '+fmt(f.density)+' 處</p></div>':'';
  const baseline=rows.find(r=>r.id===base);
  const diff=r=>r.score===null||baseline?.score===null||!baseline?'—':((r.score-baseline.score>0?'+':'')+(r.score-baseline.score).toFixed(1));
  $('#compare-note').textContent=baseline?'以 '+baseline.name+' 為基準標記；全區比較保留並可與地圖範圍分開使用。':'選取比較基準。';
  $('#comparison').innerHTML=rows.map(r=>'<tr class="'+(r.id===base?'row-baseline':'')+'"><td>'+html(r.name)+(r.id===base?'（基準）':'')+'</td><td>'+int(r.population)+'</td><td>'+r.count+'</td><td>'+fmt(r.density)+'</td><td>'+pct(r.uncovered)+'</td><td>'+fmt(r.score)+'</td><td>'+diff(r)+'</td></tr>').join('');
  $('#provenance').innerHTML=Object.entries({資料:fc.metadata.name,來源:fc.metadata.source,類型:fc.metadata.origin,版本:fc.metadata.version,授權:fc.metadata.license}).map(([k,v])=>'<dt>'+k+'</dt><dd>'+html(v)+'</dd>').join('');
}
$('#category').addEventListener('change',e=>{category=e.target.value;focused=null;render()});
$('#area').addEventListener('change',e=>{area=e.target.value;focused=null;render()});
$('#baseline').addEventListener('change',e=>{base=e.target.value;render()});
$('#open-data').addEventListener('click',()=>$('#data-dialog').showModal());
$('#settings').addEventListener('click',()=>{showConfig(config);$('#config-dialog').showModal()});
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
initSelect();render();
