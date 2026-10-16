#!/usr/bin/env python3
"""No unverified ssh-keyscan and no unrestricted remote shell."""
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

env = os.environ
for name in ['VPS_HOST', 'VPS_PORT', 'VPS_USER', 'VPS_SSH_KEY', 'VPS_KNOWN_HOSTS', 'APP_IMAGE', 'REGISTRY_ACTOR', 'REGISTRY_TOKEN']:
    if not env.get(name):
        raise SystemExit('Missing required setting: ' + name)
if not re.fullmatch(r'[A-Za-z0-9.-]+', env['VPS_HOST']) or env['VPS_HOST'].startswith('-'):
    raise SystemExit('Invalid VPS host')
if env['VPS_USER'] != 'deploy-lrmsmmnew' or not env['VPS_PORT'].isdigit() or not 1 <= int(env['VPS_PORT']) <= 65535:
    raise SystemExit('Use the dedicated deployment account and a valid SSH port')
with tempfile.TemporaryDirectory() as temp:
    key, known = Path(temp) / 'key', Path(temp) / 'known_hosts'
    key.write_text(env['VPS_SSH_KEY'] + '\n'); key.chmod(0o600)
    known.write_text(env['VPS_KNOWN_HOSTS'] + '\n'); known.chmod(0o600)
    payload = json.dumps({'image': env['APP_IMAGE'], 'actor': env['REGISTRY_ACTOR'], 'token': env['REGISTRY_TOKEN']})
    subprocess.run(['ssh', '-i', str(key), '-p', env['VPS_PORT'],
        '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
        '-o', 'HostKeyAlias=lrmsmmnew-vps', '-o', 'UserKnownHostsFile=' + str(known),
        '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3',
        env['VPS_USER'] + '@' + env['VPS_HOST'], 'deploy'],
        input=payload, text=True, check=True, timeout=1220)
