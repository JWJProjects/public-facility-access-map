"""Render and exercise the actual application inside an installed Slicer Qt WebEngine."""
import os
import json
from pathlib import Path
import qt
import slicer
root=Path(os.environ['ATLAS_ROOT'])
fixture=(root/'data'/'demo.geojson').read_text()
view=slicer.qSlicerWebWidget()
view.resize(1440, 1320)
view.show()
view.url=qt.QUrl(os.environ.get('ATLAS_URL','http://127.0.0.1:8912/'))
i=0
helper="""
const q=s=>document.querySelector(s);
const says=(s,t)=>q(s)?.textContent.includes(t);
const total=s=>document.querySelectorAll(s).length;
const select=(s,v)=>{q(s).value=v;q(s).dispatchEvent(new Event('change'));};
const click=s=>q(s).click();
const put=(s,val)=>{q(s).value=val;q(s).dispatchEvent(new Event('input'));};
const importGeo=(data,name)=>{const dt=new DataTransfer();dt.items.add(new File([data],name,{type:'application/geo+json'}));q('#file').files=dt.files;q('#file').dispatchEvent(new Event('change'));};
"""
checks=[
 ('Overview', "total('.rankrow')===6 && total('#map circle')===40 && says('#kpis','22 處') && says('#detail','河心')", '01-overview.png'),
 ('Filters + map keyboard + baseline', """select('#category','sport');const hit=q('[data-id="C"].district');hit.focus();hit.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));select('#baseline','D');says('#kpis','6 處')&&says('#detail','河心')&&says('.row-baseline','新街')""", None),
 ('Parameters', """click('#settings');put('#radius',1200);put('#weight',75);click('[type=submit]');says('#kpis','1200 m')&&!q('#config-dialog').open""", None),
 ('Selected analysis download', """select('#area','C');window.derived=null;window.raw=null;const create=URL.createObjectURL;URL.createObjectURL=function(b){b.text().then(text=>window.lastExport=JSON.parse(text));return create.call(this,b)};HTMLAnchorElement.prototype.click=function(){window.lastName=this.download};click('#export');total('#map .district')===1&&window.lastName==='facility-gap-analysis.geojson'""", None),
 ('Analysis contents', """lastExport.metadata.analysis.radius===1200&&lastExport.metadata.analysis.category==='sport'&&lastExport.features.length===1&&lastExport.features[0].properties.id==='C'""", None),
 ('Comparison', """select('#area','all');q('#toast').hidden=true;says('.row-baseline','新街')&&total('#comparison tr')===6""", '02-category-comparison.png'),
 ('Reject malformed import', """click('#open-data');importGeo('{"type":"FeatureCollection","features":[]}','bad.geojson');q('#data-dialog').open""", None),
 ('Reject retains current data / inject test', """if(!says('#import-state','保留原資料'))throw q('#import-state').textContent;
 const good=JSON.parse("""+json.dumps(fixture)+""");good.metadata.name='互通測試・合成資料';good.features[0].properties.customerPhone='not carried';importGeo(JSON.stringify(good),'valid.geojson');true""", None),
 ('Validated import and attribution', """says('#import-state','匯入成功：46')&&says('#provenance','互通測試')""", '03-geojson-provenance.png'),
 ('Raw export', """click('#export-input');lastName==='facility-input.geojson'""", None),
 ('Raw attribution export and field isolation', """lastExport.metadata.name==='互通測試・合成資料'&&!('customerPhone' in lastExport.features[0].properties)""", None),
 ('Reset data', """click('#reset-data');q('#data-dialog').close();says('#kpis','6 處')&&says('#provenance','六區合成示範')""", None),
 ('Resize', 'MOBILE', None),
 ('Mobile viewport and area filter', """select('#category','all');select('#area','A');const one=total('#map .district')===1;select('#area','all');if(!(one&&total('#map .district')===6&&document.documentElement.scrollWidth<=innerWidth&&innerWidth<521))throw JSON.stringify({one,n:total('#map .district'),scroll:document.documentElement.scrollWidth,innerWidth});true""", '04-mobile.png'),
]
def finish(ok):
    (root/'docs'/'browser-results.json').write_text(json.dumps({'pass':ok,'checks_completed':i,'checks_total':len(checks),'engine':'Qt WebEngine via Slicer','evidence':'actual local app'},ensure_ascii=False,indent=2)+'\n')
    slicer.app.quit()
def step():
    global i
    if i==len(checks): print('ATLAS PASS',i,flush=True);finish(True);return
    title,js,shot=checks[i]
    if js=='MOBILE':
        view.resize(390,844);i+=1;qt.QTimer.singleShot(650,step);return
    a=js.strip().split(';')
    # Use final expression as test result; object test payload itself contains no semicolons.
    view.evalJS("(()=>{try{"+helper+';'.join(a[:-1])+";return ("+a[-1]+")?'PASS':'FAIL false';}catch(e){return 'FAIL '+e;}})()")
def done(_,res):
    global i
    title,js,shot=checks[i]
    print(title,str(res),flush=True)
    if str(res).strip('"')!='PASS':finish(False);return
    def advance():
        global i
        if shot and not view.webView().grab().save(str(root/'screenshots'/shot)):finish(False);return
        i+=1;step()
    qt.QTimer.singleShot(350,advance)
view.connect('evalResult(QString,QString)',done)
qt.QTimer.singleShot(1700,step)
