"""Bounded simulator readiness and real import/restart checks for CI."""
import argparse
import json
from pathlib import Path
import subprocess
import time


def command(*args, timeout=45):
    result = subprocess.run(['xcrun', 'simctl', *args], text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            timeout=timeout)
    if result.returncode:
        raise RuntimeError(result.stdout.strip() or f'simctl exited {result.returncode}')
    return result.stdout.strip()


def retry(action, seconds, label):
    deadline = time.monotonic() + seconds
    last = 'not ready'
    while time.monotonic() < deadline:
        try:
            return action(max(1, min(45, deadline - time.monotonic())))
        except (RuntimeError, subprocess.TimeoutExpired) as error:
            last = str(error)
            print(f'{label}: {last}', flush=True)
            time.sleep(min(3, max(0, deadline - time.monotonic())))
    raise RuntimeError(f'{label} timed out after {seconds}s: {last}')


def wait_for_boot(simulator):
    def ready(timeout):
        data = json.loads(command('list', 'devices', 'available', '-j', timeout=timeout))
        device = next((d for devices in data['devices'].values() for d in devices
                       if d['udid'] == simulator), None)
        if device is None:
            raise RuntimeError('Selected simulator is unavailable')
        if device['state'] != 'Booted':
            raise RuntimeError('Simulator state: ' + device['state'])
        command('bootstatus', simulator, '-b', timeout=timeout)
        return device
    device = retry(ready, 480, 'Simulator boot')
    print(f"Simulator booted: {device['name']} ({simulator})", flush=True)


def verify(simulator, app):
    app_id = 'jp.minimalisttako.totonoebousai'
    if not Path(app).is_dir():
        raise RuntimeError('Built app bundle is missing: ' + app)
    retry(lambda timeout: command('install', simulator, app, timeout=timeout),
          120, 'Install built app')
    container = Path(command('get_app_container', simulator, app_id, 'data'))
    for phase in ('import', 'verify'):
        result = container / 'Documents' / f'migration-{phase}.txt'
        # A leftover PASS from a previous invocation must never satisfy this run.
        result.unlink(missing_ok=True)
        launched = False
        try:
            print(command('launch', simulator, app_id, phase), flush=True)
            launched = True
            def outcome(_timeout):
                if not result.is_file():
                    raise RuntimeError(f'Waiting for {phase} result')
                return result.read_text()
            text = retry(outcome, 90, f'iOS {phase}')
            print(text, flush=True)
            if not text.startswith('PASS:'):
                raise RuntimeError(f'iOS {phase} failed: {text}')
        finally:
            # A successful import is terminated and relaunched for persistence verification.
            if launched:
                command('terminate', simulator, app_id, timeout=15)
    print('PASS: real iOS WebView import and persistence after app restart', flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['wait', 'verify'])
    parser.add_argument('simulator')
    parser.add_argument('--app', default='ios/build/Build/Products/Debug-iphonesimulator/App.app')
    args = parser.parse_args()
    if args.mode == 'wait':
        wait_for_boot(args.simulator)
    else:
        verify(args.simulator, args.app)


if __name__ == '__main__':
    main()
