#!/usr/bin/env python3
"""One-time setup on the shared VPS. Does not change proxy, DNS or Docker daemon."""
import argparse
import grp
import json
import os
from pathlib import Path
import pwd
import re
import secrets
import shutil
import socket
import subprocess

ROOT = Path('/opt/lrmsmmnew')
USER = 'deploy-lrmsmmnew'
HOME = Path('/var/lib/lrmsmmnew-deploy')
MARKER = 'lrmsmmnew: lrmcorp/lrmsmmnew\n'


def run(*args):
    return subprocess.check_output(args, text=True).strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--domain', default='lrmsosmed.playgo.id')
    parser.add_argument('--network', default='proxy-net')
    parser.add_argument('--port', type=int, default=4007)
    parser.add_argument('--ssh-port', type=int, default=1506)
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise RuntimeError('Run as root on the VPS')
    if not re.fullmatch(r'[a-z0-9]+(?:[.-][a-z0-9]+)+', args.domain):
        raise ValueError('Invalid domain')
    if not re.fullmatch(r'[A-Za-z0-9_-]+', args.network) or not 1024 <= args.port <= 65535:
        raise ValueError('Invalid network or application port')
    run('docker', 'compose', 'version')
    network = json.loads(run('docker', 'network', 'inspect', args.network))[0]
    if network.get('Internal') or not network.get('Containers'):
        raise RuntimeError('Select the existing network containing Nginx Proxy Manager')
    if not any('nginx-proxy-manager' in run('docker', 'inspect', '--format', '{{.Config.Image}}', c)
               for c in network['Containers']):
        raise RuntimeError('Nginx Proxy Manager was not found on this network')
    owned = (ROOT / '.owned').exists()
    if owned and (ROOT / '.owned').read_text() != MARKER:
        raise RuntimeError('Unexpected project ownership marker')
    if not owned:
        if ROOT.exists() and any(ROOT.iterdir()):
            raise RuntimeError('Existing unknown application folder; inspect it first')
        for path in [HOME, Path('/etc/sudoers.d/lrmsmmnew'), Path('/usr/local/lib/lrmsmmnew'),
                     Path('/usr/local/sbin/lrmsmmnew-receiver'), Path('/usr/local/sbin/lrmsmmnew-owner')]:
            if path.exists():
                raise RuntimeError('Existing unknown setup path: ' + str(path))
        try:
            pwd.getpwnam(USER)
        except KeyError:
            pass
        else:
            raise RuntimeError('Deployment user already exists outside this setup')
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', args.port))
    ssh = run('/usr/sbin/sshd', '-T').splitlines()
    if 'port ' + str(args.ssh_port) not in ssh:
        raise RuntimeError('SSH port does not match the active SSH configuration')
    host = next((Path(line.split(maxsplit=1)[1] + '.pub') for line in ssh
                 if line.startswith('hostkey ') and 'ed25519' in line), None)
    if host is None or not host.is_file():
        raise RuntimeError('Active Ed25519 host key not found')
    os.umask(0o077)
    ROOT.mkdir(mode=0o700, exist_ok=True)
    for name in ['data', 'backups', 'access', 'incoming']:
        (ROOT / name).mkdir(mode=0o700, exist_ok=True)
    os.chown(ROOT / 'data', 1000, 1000)
    envfile = ROOT / '.env'
    if envfile.is_symlink():
        raise RuntimeError('Configuration must not be a symlink')
    if not envfile.exists():
        envfile.write_text('\n'.join([
            'PUBLIC_URL=https://' + args.domain, 'APP_PORT=' + str(args.port),
            'NPM_NETWORK=' + args.network, 'ENCRYPTION_KEY=' + secrets.token_hex(32),
            'WEBHOOK_VERIFY_TOKEN=' + secrets.token_hex(24), 'APP_TIMEZONE=Asia/Jakarta',
            'IG_APP_ID=', 'IG_APP_SECRET=', 'THREADS_APP_ID=', 'THREADS_APP_SECRET=', '',
        ]))
    else:
        values = dict(line.split('=', 1) for line in envfile.read_text().splitlines() if '=' in line and not line.startswith('#'))
        if any(values.get(k) != v for k, v in {'PUBLIC_URL': 'https://' + args.domain, 'APP_PORT': str(args.port), 'NPM_NETWORK': args.network}.items()):
            raise RuntimeError('Existing domain, port or network differs; configuration preserved')
    source = Path(__file__).resolve().parent
    shutil.copy2(source / 'compose.production.yml', ROOT / 'compose.yml')
    shutil.copy2(source / 'receiver.py', '/usr/local/sbin/lrmsmmnew-receiver')
    Path('/usr/local/sbin/lrmsmmnew-receiver').chmod(0o755)
    shutil.copy2(source / 'owner.py', '/usr/local/sbin/lrmsmmnew-owner')
    Path('/usr/local/sbin/lrmsmmnew-owner').chmod(0o700)
    installed = Path('/usr/local/lib/lrmsmmnew')
    installed.mkdir(mode=0o755, exist_ok=True)
    entry = installed / 'ssh-entry.sh'
    entry.write_text('#!/bin/sh\nexec timeout 1200 sudo -n /usr/local/sbin/lrmsmmnew-receiver "$SSH_ORIGINAL_COMMAND"\n')
    entry.chmod(0o755)
    if not owned:
        run('useradd', '--create-home', '--home-dir', str(HOME), '--shell', '/bin/sh', USER)
    account = pwd.getpwnam(USER)
    if account.pw_dir != str(HOME):
        raise RuntimeError('Unexpected deployment user home')
    os.chown(HOME, 0, account.pw_gid)
    HOME.chmod(0o750)
    sshdir = HOME / '.ssh'
    sshdir.mkdir(mode=0o750, exist_ok=True)
    os.chown(sshdir, 0, account.pw_gid)
    key = ROOT / 'access' / 'actions_ed25519'
    if not key.exists():
        run('ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-C', 'lrmsmmnew-actions', '-f', str(key))
    authorized = sshdir / 'authorized_keys'
    authorized.write_text('restrict,command="' + str(entry) + '" ' + key.with_suffix('.pub').read_text().strip() + '\n')
    os.chown(authorized, 0, account.pw_gid)
    authorized.chmod(0o640)
    sudoers = Path('/etc/sudoers.d/lrmsmmnew')
    sudoers.write_text(USER + ' ALL=(root) NOPASSWD: /usr/local/sbin/lrmsmmnew-receiver *\n')
    sudoers.chmod(0o440)
    run('visudo', '-cf', str(sudoers))
    # Hostname is supplied by GitHub SSH config; pin this exact local host key.
    (ROOT / 'access' / 'known_hosts').write_text('lrmsmmnew-vps ' + ' '.join(host.read_text().split()[:2]) + '\n')
    (ROOT / '.owned').write_text(MARKER)
    print('Setup ready: /opt/lrmsmmnew; deployment user: ' + USER)
    print('NPM target: http://lrmsmmnew-app:3000 on ' + args.network)
    print('Secrets stay private in /opt/lrmsmmnew/.env and access/.')
    print('No DNS, firewall, shared proxy, Docker daemon or other application was modified.')


if __name__ == '__main__':
    main()
