// Public HTTPS downloads with pinned DNS and fresh validation on every redirect.
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import { err } from '../util.js';
const blocked = new net.BlockList();
for (const [ip, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['192.0.0.0',24],['192.0.2.0',24],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]]) blocked.addSubnet(ip,prefix,'ipv4');
export function publicAddress(address) {
  const version = net.isIP(address);
  if (version === 4) return !blocked.check(address,'ipv4');
  return version === 6 && /^[23]/i.test(address) && !/^2001:db8:/i.test(address) && !/^2002:/i.test(address);
}
export function imageUrl(value) {
  if (typeof value !== 'string' || value.length > 16384) throw err(400,'image_url_invalid',"Invalid image URL.");
  let url;
  try { url = new URL(value); } catch { throw err(400,'image_url_invalid',"Invalid image URL."); }
  const hostname = url.hostname.replace(/^\[|\]$/g,'');
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
      (net.isIP(hostname) && !publicAddress(hostname))) throw err(400,'image_url_invalid',"Use a public HTTPS URL without credentials or private network addresses.");
  return url;
}
export function downloadImage(value, redirects=0) {
  const url = imageUrl(value);
  return new Promise((resolve,reject) => {
    const request = https.get(url, {
      lookup(hostname, options, callback) {
        dns.lookup(hostname,{all:true},(error, addresses) => {
          if (error || !addresses?.length || addresses.some(a=>!publicAddress(a.address))) return callback(new Error('Blocked image destination'));
          // Pin this request to the addresses that were checked (no second DNS lookup).
          callback(null, options?.all ? addresses : addresses[0].address, addresses[0].family);
        });
      },
    }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400) {
        response.resume();
        if (!response.headers.location || redirects >= 3) return reject(err(400,'image_fetch_failed',"Image redirect is invalid or exceeds the redirect limit."));
        try { resolve(downloadImage(new URL(response.headers.location,url).href,redirects+1)); } catch(error) { reject(error); }
        return;
      }
      if (response.statusCode !== 200) { response.resume(); return reject(err(400,'image_fetch_failed',"Image could not be downloaded. Use a valid public download URL or send base64.")); }
      const chunks=[]; let bytes=0;
      response.on('data',chunk=>{
        bytes+=chunk.length;
        if (bytes>8*1024*1024) { response.destroy(); reject(err(400,'image_too_large',"Image must not exceed 8 MB.")); }
        else chunks.push(chunk);
      });
      response.on('end',()=>resolve(Buffer.concat(chunks)));
      response.on('error',()=>reject(err(400,'image_fetch_failed',"Image download was interrupted.")));
    });
    request.setTimeout(15000,()=>request.destroy(new Error('Image timeout')));
    const deadline = setTimeout(()=>request.destroy(new Error('Image deadline')),20000);
    deadline.unref();
    request.on('close',()=>clearTimeout(deadline));
    request.on('error',()=>reject(err(400,'image_fetch_failed',"Image could not be downloaded from the public URL. ChatGPT sandbox links are not accessible to the server; use an HTTPS download URL or base64.")));
  });
}
