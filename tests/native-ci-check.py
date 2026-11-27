"""Failure-path regression checks for the native CI wrappers, no simulators required."""
import contextlib
import io
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('ios_ci', ROOT / 'scripts/check-ios-simulator.py')
ios = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ios)


class Clock:
    now = 0
    def monotonic(self): return self.now
    def sleep(self, seconds): self.now += seconds


class NativeCI(unittest.TestCase):
    def test_boot_waits_and_times_out_without_false_success(self):
        clock = Clock()
        states = iter(['Booting', 'Booted'])
        def listing(*args, **kwargs):
            if args[0] == 'bootstatus': return ''
            return json.dumps({'devices': {'iOS': [{'udid': 'test', 'name': 'iPhone', 'state': next(states)}]}})
        with patch.object(ios.time, 'monotonic', clock.monotonic), patch.object(ios.time, 'sleep', clock.sleep), patch.object(ios, 'command', listing):
            ios.wait_for_boot('test')
        self.assertEqual(clock.now, 3)
        clock.now = 0
        with patch.object(ios.time, 'monotonic', clock.monotonic), patch.object(ios.time, 'sleep', clock.sleep):
            with self.assertRaisesRegex(RuntimeError, 'timed out'):
                ios.retry(lambda _: (_ for _ in ()).throw(RuntimeError('not ready')), 6, 'Boot')
        self.assertEqual(clock.now, 6)

    def test_import_restart_verify_removes_stale_pass_and_rejects_failure(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            app = root / 'App.app'; app.mkdir()
            documents = root / 'Documents'; documents.mkdir()
            events = []
            def run(*args, **kwargs):
                events.append(args)
                if args[0] == 'get_app_container': return str(root)
                if args[0] == 'launch':
                    phase = args[-1]
                    path = documents / f'migration-{phase}.txt'
                    self.assertFalse(path.exists(), 'stale result was not removed')
                    path.write_text('PASS: actual ' + phase)
                return ''
            for phase in ('import', 'verify'):
                (documents / f'migration-{phase}.txt').write_text('PASS: stale')
            with patch.object(ios, 'command', run): ios.verify('test', str(app))
            self.assertEqual([x[0] for x in events], ['install', 'get_app_container', 'launch', 'terminate', 'launch', 'terminate'])
            def failed(*args, **kwargs):
                value = run(*args, **kwargs)
                if args[0] == 'launch': (documents / f'migration-{args[-1]}.txt').write_text('FAIL: wrong photo')
                return value
            events.clear()
            with patch.object(ios, 'command', failed), self.assertRaisesRegex(RuntimeError, 'wrong photo'):
                ios.verify('test', str(app))
            self.assertEqual(sum(x[0] == 'launch' for x in events), 1)

    def test_android_retries_only_transient_repository_errors(self):
        for kind, expected_status, count in [('transient', 0, 2), ('compiler', 7, 1), ('always', 1, 3)]:
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as folder:
                root = Path(folder); (root/'bin').mkdir()
                sleep = root/'bin/sleep'; sleep.write_text('#!/bin/sh\nexit 0\n'); sleep.chmod(0o755)
                (root/'gradlew').write_text('''#!/usr/bin/env bash
n=$(cat calls 2>/dev/null || echo 0); n=$((n+1)); echo "$n" > calls
case "$SCENARIO" in
 compiler) echo 'Compilation failed'; exit 7;;
 transient) if [ "$n" -eq 1 ]; then echo 'Received status code 429 from server'; exit 1; fi;;
 always) echo 'Received status code 503 from server'; exit 1;;
esac
exit 0
''')
                result = subprocess.run(['bash', str(ROOT/'scripts/compile-android-ci.sh')], cwd=root,
                                        env={**os.environ, 'PATH': str(root/'bin')+os.pathsep+os.environ['PATH'], 'SCENARIO': kind},
                                        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
                self.assertEqual(result.returncode, expected_status, result.stdout)
                self.assertEqual(int((root/'calls').read_text()), count)


if __name__ == '__main__':
    with contextlib.redirect_stdout(io.StringIO()):
        unittest.main()
