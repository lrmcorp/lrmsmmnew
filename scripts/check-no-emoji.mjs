import fs from 'node:fs';
import path from 'node:path';
const forbidden=/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{FE0F}]/u;
let failures=0;
function scan(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isSymbolicLink()||['node_modules','.git','.agents','docs','test','deploy'].includes(item.name))continue;if(item.isDirectory())scan(file);else if(/\.(js|mjs|cjs|css|html)$/.test(file)&&file!=='src/meta/mock.js'){// The Meta mock contains customer-message fixtures, not app UI.
 const lines=fs.readFileSync(file,'utf8').split('\n');lines.forEach((line,i)=>{if(forbidden.test(line)){console.error(`${file}:${i+1}: forbidden interface pictogram`);failures++;}});}}}
scan('.');if(failures)process.exitCode=1;else console.log('Interface emoji check passed');
