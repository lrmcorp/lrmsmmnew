// Interface language is English; generated captions and customer content are separate data.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {t} from '../public/strings.en.js';
import {fmtTime} from '../public/ui.js';
assert.equal(t('nav.home'),'Home');
assert.equal(t('nav.drafts'),'Drafts');
assert.equal(t('nav.generator'),'Content Generator');
assert.equal(t('nav.group.engagement'),'Engagement');
assert.equal(t('login.cta'),'Sign in');
assert.match(fs.readFileSync('public/app.js','utf8'),/documentElement.lang = 'en'/);
assert.match(fs.readFileSync('public/index.html','utf8'),/<html[^>]+lang=["']en["']/);
assert.match(fmtTime('2026-11-01T05:15:00Z'),/^12[.:]15$/);
for(const file of ['app.js','ui.js','content-workspace.js','generator-workspace.js','workspace-pages.js'])assert.doesNotMatch(fs.readFileSync('public/'+file,'utf8'),/\bwindow\.(confirm|prompt|alert)\s*\(/);
console.log('PASS English UI defaults, WIB helpers and application dialogs');
