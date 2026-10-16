#!/usr/bin/env python3
"""Root-owned, forced SSH receiver for this repository only."""
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = Path('/opt/lrmsmmnew')
IMAGE = 'ghcr.io/lrmcorp/lrmsmmnew'
MARKER = 'lrmsmmnew: lrmcorp/lrmsmmnew\n'


def image_ref(value):
    if not isinstance(value, str) or not re.fullmatch(re.escape(IMAGE) + r'@sha256:[0-9a-f]{64}', value):
        raise ValueError('Only a digest pinned to ghcr.io/lrmcorp/lrmsmmnew is accepted')
    return value


def call(args, *, env=None, timeout=120, input=None):
    return subprocess.run(args, env=env, input=input, text=True, check=True, timeout=timeout)


def compose(image, *args):
    env = {**os.environ, 'APP_IMAGE': image}
    call(['docker', 'compose', '-p', 'lrmsmmnew', '--env-file', str(ROOT / '.env'),
          '-f', str(ROOT / 'compose.yml'), *args], env=env, timeout=180)


def deploy(payload):
    image = image_ref(payload.get('image'))
    actor, token = payload.get('actor'), payload.get('token')
    if not isinstance(actor, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', actor):
        raise ValueError('Invalid registry actor')
    if not isinstance(token, str) or not 10 <= len(token) <= 4096 or '\n' in token:
        raise ValueError('Invalid registry credential')
    # Credential is ephemeral and never persisted in the normal Docker config.
    with tempfile.TemporaryDirectory(prefix='registry-', dir=ROOT / 'incoming') as directory:
        env = {**os.environ, 'DOCKER_CONFIG': directory}
        call(['docker', 'login', 'ghcr.io', '-u', actor, '--password-stdin'], env=env, input=token, timeout=30)
        print('Pulling changed image layers (maximum 15 minutes).', flush=True)
        call(['docker', 'pull', image], env=env, timeout=900)
    current = ROOT / 'current-image'
    previous = image_ref(current.read_text().strip()) if current.exists() else None
    backup = ROOT / 'backups' / (time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()) + '-' + str(os.getpid()))
    required = sum(p.stat().st_size for p in (ROOT / 'data').rglob('*') if p.is_file())
    if shutil.disk_usage(ROOT).free < required + 512 * 1024**2:
        raise RuntimeError('Insufficient free space for an application backup')
    if previous:
        compose(previous, 'stop', 'app')
    backup.mkdir(mode=0o700)
    try:
        shutil.copy2(ROOT / '.env', backup / '.env')
        shutil.copytree(ROOT / 'data', backup / 'data')
    except Exception:
        # An incomplete backup must never replace the still-original live data.
        if previous:
            compose(previous, 'up', '-d', '--no-build', '--wait', '--wait-timeout', '90')
        raise
    try:
        compose(image, 'up', '-d', '--no-build', '--wait', '--wait-timeout', '90')
    except Exception:
        # Stop the new worker before restoring its private SQLite/media snapshot.
        compose(image, 'stop', 'app')
        if (backup / 'data').exists():
            failed = ROOT / ('failed-data-' + backup.name)
            (ROOT / 'data').rename(failed)
            shutil.copytree(backup / 'data', ROOT / 'data')
            for directory, _, files in os.walk(ROOT / 'data'):
                os.chown(directory, 1000, 1000)
                for name in files:
                    os.chown(Path(directory) / name, 1000, 1000)
        if previous:
            compose(previous, 'up', '-d', '--no-build', '--wait', '--wait-timeout', '90')
            print('Deployment failed; previous release and data restored.', flush=True)
        raise
    temporary = ROOT / '.current-image.tmp'
    temporary.write_text(image + '\n')
    temporary.replace(current)
    print('Deployed ' + image, flush=True)


def main():
    if os.geteuid() != 0 or (ROOT / '.owned').read_text() != MARKER:
        raise RuntimeError('Unrecognized application installation')
    command = sys.argv[1:] or ['status']
    if command not in [['deploy'], ['status']]:
        raise ValueError('Only deploy or status is allowed')
    with (ROOT / 'deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if command == ['status']:
            print((ROOT / 'current-image').read_text().strip() if (ROOT / 'current-image').exists() else 'not-deployed')
            return
        data = sys.stdin.buffer.read(8193)
        if len(data) > 8192:
            raise ValueError('Payload too large')
        deploy(json.loads(data))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # No request body, tokens, private environment or application logs.
        print('Deployment failed: ' + type(error).__name__ + '. Check receiver setup, image access and application health.', file=sys.stderr)
        sys.exit(1)
