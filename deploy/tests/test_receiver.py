import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('receiver', Path(__file__).parents[1] / 'receiver.py')
receiver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(receiver)


class ReceiverTests(unittest.TestCase):
    def test_digest_must_belong_to_this_repository(self):
        valid = receiver.IMAGE + '@sha256:' + 'a' * 64
        self.assertEqual(receiver.image_ref(valid), valid)
        for value in [None, 'ubuntu:latest', valid.replace('lrmsmmnew', 'other'),
                      receiver.IMAGE + ':main', valid + '; sh', valid[:-1]]:
            with self.assertRaises(ValueError):
                receiver.image_ref(value)

    def test_credentials_and_image_are_rejected_before_commands(self):
        for body in [{'image': 'ubuntu:latest'},
                     {'image': receiver.IMAGE + '@sha256:' + 'a' * 64, 'actor': '-bad'},
                     {'image': receiver.IMAGE + '@sha256:' + 'a' * 64, 'actor': 'lrmcorp', 'token': 'a\nb'}]:
            with patch.object(receiver, 'call') as call:
                with self.assertRaises(ValueError):
                    receiver.deploy(body)
                call.assert_not_called()

    def test_compose_is_scoped_to_the_application(self):
        image = receiver.IMAGE + '@sha256:' + 'a' * 64
        with patch.object(receiver, 'call') as call:
            receiver.compose(image, 'stop', 'app')
            args = call.call_args.args[0]
            self.assertEqual(args[args.index('-p') + 1], 'lrmsmmnew')
            self.assertIn('/opt/lrmsmmnew/compose.yml', args)
            self.assertEqual(call.call_args.kwargs['env']['APP_IMAGE'], image)
            self.assertNotIn('down', args)

    def test_pull_has_fifteen_minute_deadline(self):
        # Exercise the authenticated pull and stop before any application mutation.
        image = receiver.IMAGE + '@sha256:' + 'a' * 64
        with patch.object(receiver.tempfile, 'TemporaryDirectory') as directory, patch.object(receiver, 'call') as call:
            directory.return_value.__enter__.return_value = '/private/ephemeral'
            call.side_effect = [None, TimeoutError('pull deadline')]
            with self.assertRaises(TimeoutError):
                receiver.deploy({'image': image, 'actor': 'lrmcorp', 'token': 'ephemeral-token'})
            self.assertEqual(call.call_args.kwargs['timeout'], 900)
            self.assertEqual(call.call_args.args[0], ['docker', 'pull', image])
            self.assertNotIn('ephemeral-token', str(call.call_args))

    def test_failed_new_release_restores_previous_data_and_image(self):
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'incoming').mkdir()
            (root / 'backups').mkdir()
            (root / 'data').mkdir()
            (root / 'data' / 'lrmsmm.db').write_text('original-data')
            (root / '.env').write_text('PRIVATE=not-logged\n')
            old = receiver.IMAGE + '@sha256:' + 'a' * 64
            new = receiver.IMAGE + '@sha256:' + 'b' * 64
            (root / 'current-image').write_text(old)
            calls = []
            def compose(image, *args):
                calls.append((image, args))
                if image == new and args[0] == 'up':
                    (root / 'data' / 'lrmsmm.db').write_text('new-schema')
                    raise RuntimeError('health check failed')
            with patch.object(receiver, 'ROOT', root), patch.object(receiver, 'call'), \
                    patch.object(receiver, 'compose', side_effect=compose), patch.object(receiver.os, 'chown'):
                with self.assertRaises(RuntimeError):
                    receiver.deploy({'image': new, 'actor': 'lrmcorp', 'token': 'ephemeral-token'})
            self.assertEqual((root / 'data' / 'lrmsmm.db').read_text(), 'original-data')
            self.assertEqual((root / 'current-image').read_text(), old)
            self.assertEqual(calls[-1][0], old)
            self.assertEqual(calls[-1][1][0], 'up')

    def test_incomplete_backup_never_replaces_live_data(self):
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ['incoming', 'backups', 'data']:
                (root / name).mkdir()
            (root / 'data' / 'lrmsmm.db').write_text('original-data')
            (root / '.env').write_text('PRIVATE=not-logged\n')
            old = receiver.IMAGE + '@sha256:' + 'a' * 64
            (root / 'current-image').write_text(old)
            with patch.object(receiver, 'ROOT', root), patch.object(receiver, 'call'), \
                    patch.object(receiver, 'compose') as compose, \
                    patch.object(receiver.shutil, 'copytree', side_effect=OSError('disk full')):
                with self.assertRaises(OSError):
                    receiver.deploy({'image': receiver.IMAGE + '@sha256:' + 'b' * 64,
                                     'actor': 'lrmcorp', 'token': 'ephemeral-token'})
                self.assertEqual(compose.call_args.args[0], old)
                self.assertEqual(compose.call_args.args[1], 'up')
            self.assertEqual((root / 'data' / 'lrmsmm.db').read_text(), 'original-data')
