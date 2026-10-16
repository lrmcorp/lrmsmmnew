#!/usr/bin/env python3
import getpass
import json
from pathlib import Path
import subprocess
import sys

root = Path('/opt/lrmsmmnew')
image = (root / 'current-image').read_text().strip()
email = input('Owner email: ').strip()
name = input('Owner name: ').strip()
password = getpass.getpass('Owner password (hidden): ')
if password != getpass.getpass('Repeat password (hidden): '):
    sys.exit('Passwords do not match. No account was created.')
# No shell, command-line password, network access or secret output.
subprocess.run(['docker', 'run', '--rm', '-i', '--network', 'none',
    '--env-file', str(root / '.env'), '-e', 'DATA_DIR=/data',
    '-v', str(root / 'data') + ':/data', image,
    'node', '--no-warnings', 'scripts/provision-owner.js'],
    input=json.dumps({'email': email, 'name': name, 'password': password}),
    text=True, check=True)
