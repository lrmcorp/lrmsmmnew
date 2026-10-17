import { test, after } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import https from 'node:https';
import dns from 'node:dns';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lrmsmm-ai-images-'));
Object.assign(process.env, { META_MOCK: '1', DATA_DIR: directory });
const { publicAddress, imageUrl, downloadImage } = await import('../src/services/ai-images.js');
after(() => fs.rmSync(directory, { recursive: true, force: true }));

test('image URL validation rejects private, mapped, non-HTTPS and credential-bearing destinations', () => {
  for (const address of ['127.0.0.1','10.1.2.3','169.254.169.254','192.168.1.2','::1','::ffff:127.0.0.1','fc00::1','2001:db8::1']) assert.equal(publicAddress(address),false,address);
  assert.equal(publicAddress('1.1.1.1'),true);
  for (const url of ['http://example.com/a','https://127.0.0.1/a','https://[::1]/a','https://user:password@example.com/a','sandbox:/mnt/data/image.png']) assert.throws(()=>imageUrl(url));
});
function transport(t, responses, address='1.1.1.1') {
  const calls=[];
  t.mock.method(dns,'lookup',(_host,_options,callback)=>queueMicrotask(()=>callback(null,[{address,family:4}])));
  t.mock.method(https,'get',(url,options,callback)=>{
    calls.push(url.href);
    const request=new EventEmitter();request.setTimeout=()=>{};
    request.destroy=error=>{request.emit('error',error);request.emit('close');};
    options.lookup(url.hostname,{all:true},(error,addresses)=>{
      if(error){request.destroy(error);return;}
      assert.equal(addresses[0].address,address);
      const data=responses.shift();
      const response=Readable.from(data.chunks || [Buffer.from('fixture-image')]);
      response.statusCode=data.status;response.headers=data.headers||{};
      response.on('end',()=>request.emit('close'));
      callback(response);
    });
    return request;
  });
  return calls;
}
test('public image bytes use checked DNS addresses without persisting the signed URL', async t=>{
  const calls=transport(t,[{status:200}]);
  assert.equal((await downloadImage('https://images.example.com/a?signature=fixture')).toString(),'fixture-image');
  assert.equal(calls.length,1);
});
test('DNS resolution to a private address is rejected before response bytes', async t=>{
  transport(t,[],'127.0.0.1');
  await assert.rejects(downloadImage('https://images.example.com/a'),e=>e.code==='image_fetch_failed');
});
test('redirects are revalidated and cannot reach instance metadata', async t=>{
  const calls=transport(t,[{status:302,headers:{location:'https://169.254.169.254/latest'}}]);
  await assert.rejects(downloadImage('https://images.example.com/a'),e=>e.code==='image_url_invalid');
  assert.equal(calls.length,1);
});
