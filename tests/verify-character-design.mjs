// Run with: node tests/verify-character-design.mjs
// Intentional approval-lock checks; any change must be reviewed with the owner.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const paths=['assets/tako.svg','assets/tako-blink.svg','assets/app-icon.svg'];
for(const path of paths){
  const svg=readFileSync(new URL('../'+path,import.meta.url),'utf8');
  assert.match(svg,/<svg\b/,path+' must be SVG');
  assert.doesNotMatch(svg,/M54 32Q79 23 102 34/,path+' cap may not have a decorative stripe');
  assert.doesNotMatch(svg,/<text\b|<image\b/i,path+' cap design must not acquire an image or text logo');
  if(path.includes('app-icon')){
    assert.match(svg,/fill="#32373d"[^>]*d="M152 164q8-86 89-91/,path+' cap crown shape changed');
    assert.match(svg,/fill="#222932"[^>]*d="M129 161q117-31 236-3/,path+' cap brim shape changed');
  }else{
    assert.match(svg,/fill="url\(#cap\)"[^>]*d="M30 58Q30 27 53 23/,path+' cap crown changed');
    assert.match(svg,/fill="#292c34"[^>]*d="M24 62Q74 51 129 61/,path+' cap brim changed');
  }
}
console.log('Tako plain black cap SVG checks: 3/3 passed. Visual review still required.');
