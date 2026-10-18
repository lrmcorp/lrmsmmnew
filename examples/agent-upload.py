#!/usr/bin/env python3
"""Upload ordered media, then create a review draft (default) or scheduled post.
LRMSMM_API_KEY is read from the environment; never put it in source control.
"""
import argparse
import json
import mimetypes
import os
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request


def request(base, key, method, route, body=None, raw=False, headers=None):
    hdr = {'Authorization': 'Bearer ' + key, **(headers or {})}
    if body is not None and not raw:
        body = json.dumps(body).encode()
        hdr['Content-Type'] = 'application/json'
    req = urllib.request.Request(base + '/v1' + route, data=body, method=method, headers=hdr)
    try:
        with urllib.request.urlopen(req, timeout=180) as response:
            data = response.read()
            return json.loads(data) if data else None
    except urllib.error.HTTPError as error:
        raise SystemExit(f'HTTP {error.code}: {error.read().decode()}') from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', default='https://lrmsosmed.playgo.id')
    parser.add_argument('--account', action='append', required=True, help='Repeat for multiple account IDs')
    parser.add_argument('--caption', required=True)
    parser.add_argument('--at', help='ISO 8601 with timezone, e.g. 2026-12-01T09:00:00+07:00')
    parser.add_argument('--request-id', required=True, help='Stable unique ID; reuse when retrying the same submission')
    parser.add_argument('--mode', choices=['draft', 'schedule', 'now'], default='draft')
    parser.add_argument('files', nargs='+', type=Path, help='JPEG/PNG/MP4/MOV in carousel order')
    args = parser.parse_args()
    key = os.environ.get('LRMSMM_API_KEY')
    if not key:
        parser.error('Set LRMSMM_API_KEY privately in your environment')
    if args.mode == 'schedule' and not args.at:
        parser.error('--mode schedule requires --at')
    if not args.base.startswith('https://'):
        parser.error('--base must use HTTPS')
    base = args.base.rstrip('/')
    media_ids = []
    for file in args.files:
        size = file.stat().st_size
        mime = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4', '.mov': 'video/quicktime'}.get(file.suffix.lower())
        if not mime or not size or size > 300 * 1024 * 1024:
            parser.error('Use non-empty JPEG/PNG/MP4/MOV files up to 300 MB')
        # Chunk uploads also work behind proxies with smaller request limits.
        upload = request(base, key, 'POST', '/media/uploads', {'mime_type': mime, 'size_bytes': size, 'original_name': file.name, 'in_library': False})
        with file.open('rb') as source:
            for index in range(1, upload['part_count'] + 1):
                request(base, key, 'PUT', f"/media/{upload['id']}/parts/{index}", source.read(upload['part_size']), raw=True, headers={'Content-Type': 'application/octet-stream'})
        result = request(base, key, 'POST', f"/media/{upload['id']}/complete")
        media_ids.append(result['id'])
    body = {'content': args.caption, 'media_ids': media_ids, 'targets': [{'account_id': a} for a in args.account]}
    if args.at and args.mode != 'now':
        body['scheduled_at'] = args.at
    if args.mode == 'draft':
        body['request_id'] = args.request_id
        result = request(base, key, 'POST', '/agent/drafts', body)
    else:
        result = request(base, key, 'POST', '/posts', body, headers={'Idempotency-Key': args.request_id})
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
