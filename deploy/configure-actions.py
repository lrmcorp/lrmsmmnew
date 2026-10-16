#!/usr/bin/env python3
"""Run on the VPS after gh auth login; private key is sent directly to GitHub."""
import argparse
from pathlib import Path
import re
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--host', required=True)
parser.add_argument('--port', type=int, default=1506)
args = parser.parse_args()
if not re.fullmatch(r'[A-Za-z0-9.-]+', args.host) or args.host.startswith('-') or not 1 <= args.port <= 65535:
    parser.error('Invalid SSH host or port')
repo = 'lrmcorp/lrmsmmnew'
subprocess.run(['gh', 'auth', 'status'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
values = {
    'VPS_HOST': args.host, 'VPS_PORT': str(args.port), 'VPS_USER': 'deploy-lrmsmmnew',
    'VPS_SSH_KEY': Path('/opt/lrmsmmnew/access/actions_ed25519').read_text(),
    'VPS_KNOWN_HOSTS': Path('/opt/lrmsmmnew/access/known_hosts').read_text(),
}
for name, value in values.items():
    subprocess.run(['gh', 'secret', 'set', name, '--repo', repo], input=value, text=True, check=True)
subprocess.run(['gh', 'variable', 'set', 'ENABLE_VPS_DEPLOY', '--repo', repo, '--body', 'true'], check=True)
print('Dedicated deploy secrets saved. Trigger: gh workflow run deploy.yml --repo ' + repo)
