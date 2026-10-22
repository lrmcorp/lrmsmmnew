// The dashboard uses English while retaining Jakarta time for schedules.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {t} from '../public/strings.en.js';
assert.equal(t('nav.home'),'Home');
assert.equal(t('nav.drafts'),'Drafts');
assert.equal(t('nav.generator'),'Content Generator');
assert.equal(t('nav.group.engagement'),'Engagement');
assert.equal(t('login.cta'),'Sign in');
assert.match(fs.readFileSync('public/app.js','utf8'),/documentElement.lang = 'en'/);
for(const file of ['app.js','ui.js','content-workspace.js','generator-workspace.js','workspace-pages.js'])assert.doesNotMatch(fs.readFileSync('public/'+file,'utf8'),/\bwindow\.(confirm|prompt|alert)\s*\(/);
console.log('PASS English UI defaults, Jakarta time helpers and application dialogs');
