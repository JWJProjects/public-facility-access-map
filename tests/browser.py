"""Browser interaction and evidence capture. Starts a loopback-only static server."""
import functools
import http.server
import json
import os
from pathlib import Path
import tempfile
import threading
from playwright.sync_api import sync_playwright, expect

BASE = Path(__file__).resolve().parent.parent
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_): pass
serve = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=BASE))
threading.Thread(target=serve.serve_forever,daemon=True).start()
url = f'http://127.0.0.1:{serve.server_port}'
shots = BASE/'screenshots'
shots.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.getenv('BROWSER_BIN','/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':1440,'height':1070}, device_scale_factor=1, accept_downloads=True)
    errors, external = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('request', lambda r: external.append(r.url) if not r.url.startswith(url) else None)
    page.goto(url,wait_until='networkidle')
    expect(page.locator('#rank .rankrow')).to_have_count(6)
    expect(page.locator('#kpis')).to_contain_text('22 處')
    expect(page.locator('#detail')).to_contain_text('河心')
    assert page.locator('#map circle').count() == 40
    page.screenshot(path=shots/'01-overview.png', animations='disabled', full_page=True)
    page.locator('#category').select_option('sport')
    expect(page.locator('#kpis')).to_contain_text('6 處')
    page.locator('#map [data-id="C"]').focus()
    page.keyboard.press('Enter')
    expect(page.locator('#detail')).to_contain_text('河心')
    page.locator('#baseline').select_option('D')
    expect(page.locator('.row-baseline')).to_contain_text('新街')
    page.locator('#settings').click()
    page.locator('#radius').fill('1200')
    page.locator('#weight').fill('75')
    page.get_by_role('button',name='套用與重新計算').click()
    expect(page.locator('#kpis')).to_contain_text('1200 m')
    page.locator('#area').select_option('C')
    expect(page.locator('#map .district')).to_have_count(1)
    with page.expect_download() as d:
        page.locator('#export').click()
    out = json.loads(Path(d.value.path()).read_text())
    assert out['metadata']['analysis']['radius'] == 1200
    assert out['metadata']['analysis']['category'] == 'sport'
    assert out['features'][0]['properties']['id'] == 'C' and len(out['features']) == 1
    page.locator('#area').select_option('all')
    page.wait_for_timeout(3500)
    page.locator('#comparison').scroll_into_view_if_needed()
    page.screenshot(path=shots/'02-category-comparison.png', animations='disabled', full_page=True)
    page.locator('#open-data').click()
    expect(page.locator('#data-dialog')).to_be_visible()
    with tempfile.TemporaryDirectory() as t:
        path = Path(t)/'invalid.geojson'; path.write_text('{"type":"FeatureCollection","features":[]}')
        page.locator('#file').set_input_files(path)
        expect(page.locator('#import-state')).to_contain_text('保留原資料')
        good = json.loads((BASE/'data/demo.geojson').read_text())
        good['metadata']['name']='互通測試・合成資料'
        good['features'][0]['properties']['customerPhone']='not carried'
        path = Path(t)/'valid.geojson'; path.write_text(json.dumps(good,ensure_ascii=False))
        page.locator('#file').set_input_files(path)
        expect(page.locator('#import-state')).to_contain_text('匯入成功：46')
        expect(page.locator('#provenance')).to_contain_text('互通測試')
        with page.expect_download() as d2:
            page.locator('#export-input').click()
        raw = json.loads(Path(d2.value.path()).read_text())
        assert raw['metadata']['name']=='互通測試・合成資料'
        assert 'customerPhone' not in raw['features'][0]['properties']
    page.screenshot(path=shots/'03-geojson-provenance.png', animations='disabled')
    page.locator('#reset-data').click()
    expect(page.locator('#provenance')).to_contain_text('六區合成示範')
    assert not errors, errors
    assert not external, external
    mobile = browser.new_page(viewport={'width':390,'height':844}, device_scale_factor=1, is_mobile=True, has_touch=True)
    mobile.goto(url,wait_until='networkidle')
    assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
    expect(mobile.locator('#map .district')).to_have_count(6)
    mobile.locator('#area').select_option('A')
    expect(mobile.locator('#map .district')).to_have_count(1)
    mobile.locator('#area').select_option('all')
    mobile.screenshot(path=shots/'04-mobile.png', animations='disabled', full_page=True)
    browser.close()
serve.shutdown()
print('PASS: desktop render/filter/map keyboard/baseline/config/export/import validation/privacy/reset/mobile; 4 captures')
