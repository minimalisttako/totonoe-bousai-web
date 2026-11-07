"""Run release checks with Python 3 and Node; no downloaded packages required."""
from pathlib import Path
from html.parser import HTMLParser
from collections import Counter
import re, subprocess, sys

root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]
source = (root / 'index.html').read_text()
class Page(HTMLParser):
    def __init__(self):
        super().__init__(); self.ids=[]; self.handlers=[]; self.labels=[]
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        if 'id' in attrs: self.ids.append(attrs['id'])
        self.handlers.extend(v for k,v in attrs.items() if k.startswith('on'))
        if 'for' in attrs: self.labels.append(attrs['for'])
page=Page(); page.feed(source)
assert not [k for k,v in Counter(page.ids).items() if v>1], 'Duplicate element IDs'
ids=set(page.ids)
assert not set(page.labels)-ids, 'Missing label targets'
assert not set(re.findall(r"show\('([^']+)'\)", source))-ids, 'Missing page destinations'
functions=set(re.findall(r'(?:async )?function\s+(\w+)\s*\(',source))
calls=set()
for handler in page.handlers: calls.update(re.findall(r'(?<![.\w])(\w+)\(',handler))
assert not calls-functions-{'if','Number','String','confirm','alert'}, 'Missing handler functions'
worker=(root/'offline-worker.js').read_text()
app_versions=set(re.findall(r'totonoe-offline-shell-v\d+',source))
worker_versions=set(re.findall(r'totonoe-offline-shell-v\d+',worker))
assert len(app_versions)==1 and app_versions==worker_versions, 'Offline cache version mismatch'
syntax=r"const fs=require('fs');const s=fs.readFileSync(0,'utf8');let count=0;for(const m of s.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){new Function(m[1]);count++;}if(!count)throw Error('No inline scripts checked');console.log('PASS: JavaScript syntax ('+count+' scripts)');"
subprocess.run(['node','-e',syntax],input=source,text=True,check=True)
subprocess.run(['node','--check',str(root/'offline-worker.js')],check=True)
for test in ['backup-roundtrip-v79.cjs','supply-storage.cjs','supply-import.cjs','daily-behavior.cjs','replenishment.cjs','training.cjs','seasonal.cjs','feature-search.cjs','home-priorities.cjs','settings-hydration.cjs','weather-warnings.cjs','supply-measure-entry.cjs','backup-file-flow.cjs','supply-search.cjs']:
    subprocess.run(['node',str(root/'tests'/test),str(root/'index.html')],check=True)
print(f'PASS: {len(ids)} element IDs, {len(page.handlers)} handlers, labels, routes and matching offline versions')
