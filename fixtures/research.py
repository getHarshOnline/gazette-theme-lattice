#!/usr/bin/env python3
"""Render neutral research relationships through the bound native release.

Reuse Base's neutral workspace/physics fixture rather than copy its assembly.
The retained temporary workspace receives this world's neutral authored page.
No preview server, publication, configured output or production source is changed.
"""
import argparse,json,re,subprocess,sys
from html.parser import HTMLParser
from pathlib import Path

class NativePaths(HTMLParser):
    """Read complete authored stages from each labelled process path's native ordered list."""
    def __init__(self, text):
        super().__init__()
        self.paths={};self.pending=None;self.label=None;self.items=[];self.item=None
        self.feed(text)
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        if tag=='section' and 'process-path' in (attrs.get('class') or '').split() and attrs.get('aria-label'):
            self.pending=attrs['aria-label']
        elif tag=='ol' and (attrs.get('aria-label') or self.pending):
            self.label=attrs.get('aria-label') or self.pending;self.pending=None;self.items=[]
        elif self.label and tag=='li':self.item=[]
    def handle_data(self, text):
        if self.item is not None:self.item.append(text)
    def handle_endtag(self, tag):
        if self.label and tag=='li':
            self.items.append(' '.join(' '.join(self.item).split()));self.item=None
        elif self.label and tag=='ol':
            self.paths[self.label]=self.items;self.label=None

THEME=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--gazette',required=True)
p.add_argument('--resource-bindings',type=Path,required=True)
a=p.parse_args()
base=THEME.parent/'gazette-theme-base/fixtures/reading.py'
r=subprocess.run([sys.executable,str(base),'--gazette',a.gazette,'--theme',str(THEME),'--resource-bindings',str(a.resource_bindings),'--keep'],capture_output=True,text=True)
if r.returncode:raise RuntimeError('Base fixture failed: '+(r.stdout+r.stderr)[-1500:])
m=re.search(r'fixture retained: (.+)',r.stdout);assert m
work=Path(m[1]);page=work/'content/research.landing.yaml'
original=(THEME/'fixtures/research.landing.yaml').read_text();page.write_text(original)
source=(work/'workspace.toml').read_text()
def run(args):
 return subprocess.run([a.gazette,*args],input=source,text=True,capture_output=True)
args=['render-site','--local','--site','site:reading','--model-output','model.json','--graph-output','graph/index.html','--output-parent',str(work/'stages')]
r=run(args)
if r.returncode:raise RuntimeError('Research native render failed: '+r.stderr[-1500:])
result=json.loads(r.stdout);output=Path(result['directory']);files=list(output.rglob('research-relations/index.html'));assert len(files)==1
text=files[0].read_text()
for word in ['research-boundary','research-alternatives','research-controls','research-register']:assert word in text,word
assert text.count('class="project-explanation"')==6
assert 'research-study' not in text
assert 'Replaceable &lt;sensor&gt;' in text
assert text.count('<h1')==1
paths=NativePaths(text).paths
assert paths['A sample reaches a review']==[
 'Collect a sample Retain the stated conditions.',
 'Examine the sample Carry the record into analysis.',
 'Review the account Examine the analysis and its limitations.']
assert paths['A shorter dependency']==[
 'Record the question Keep enough context for another person.',
 'Continue the inquiry Use the record to examine the next condition.']
mutations={
 'unknown_explanation_argument':original.replace('heading: {level: 2, text: A boundary contains an implementation}','arguments: {layout: local}\n  heading: {level: 2, text: A boundary contains an implementation}'),
 'unknown_boundary_field':original.replace('boundary_label: Measurement interface','invented_field: Unexpected\n      boundary_label: Measurement interface'),
 'missing_alternative_body':original.replace('body: Transform the representation before decoding.',''),
 'untyped_control':original.replace('held_label: Keep fixed','held_label: [Keep fixed]'),
 'missing_process_label':original.replace('arguments: {label: A sample reaches a review}','arguments: {}')}
try:
 for name,bad in mutations.items():
  assert bad!=original,name
  page.write_text(bad);v=run(['render-site','--local','--site','site:reading']);assert v.returncode!=0,name
 fourth='''    - component: process-step
      heading: {level: 3, text: Retain the reviewed account}
      body: Keep the reviewed account for later use.
'''
 marker='      body: Examine the analysis and its limitations.\n'
 assert original.count(marker)==1
 page.write_text(original.replace(marker,marker+fourth))
 four=run(args);assert four.returncode==0,four.stderr
 four_output=Path(json.loads(four.stdout)['directory'])
 four_page=next(four_output.rglob('research-relations/index.html')).read_text()
 assert NativePaths(four_page).paths['A sample reaches a review']==paths['A sample reaches a review']+[
  'Retain the reviewed account Keep the reviewed account for later use.']
finally:page.write_text(original)
again=run(args);assert again.returncode==0,again.stderr
assert result['inventory']['identity']==json.loads(again.stdout)['inventory']['identity']
print('research fixture passed:',files[0])
