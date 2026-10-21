// The latest implementation brief explicitly keeps Bahasa Indonesia UI and WIB.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {t} from '../public/strings.en.js';
assert.equal(t('nav.home'),'Beranda');
assert.equal(t('nav.drafts'),'Draft Konten');
assert.equal(t('nav.generator'),'Sosmed Generator');
assert.equal(t('nav.group.engagement'),'Interaksi');
assert.equal(t('login.cta'),'Masuk');
assert.match(fs.readFileSync('public/app.js','utf8'),/documentElement.lang = 'id'/);
for(const file of ['app.js','ui.js','content-workspace.js','generator-workspace.js','workspace-pages.js'])assert.doesNotMatch(fs.readFileSync('public/'+file,'utf8'),/\bwindow\.(confirm|prompt|alert)\s*\(/);
console.log('PASS Bahasa Indonesia UI defaults, WIB helpers and application dialogs');
