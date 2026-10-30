"""Fake-native orchestration tests. No source bodies, Library or chat access."""
import importlib.util
import contextlib
import sqlite3
import tempfile
import unittest
from pathlib import Path
from verify_submission_test import metadata_fixture

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('attachment_plan', ROOT / 'scripts/attachment-plan.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class FakeNative:
    """Test-only receipts; no real image bytes or external calls."""
    def __init__(self):
        self.reads = self.saves = self.sends = 0
        self.calls = []

    def read(self, action):
        self.reads += 1
        return {'claim_id': action['claim_id'], 'staging_ref': 'stage_fixture_123',
                'mime': 'image/png', 'sha256': 'f' * 64,
                'byte_length': 100, 'width': 4, 'height': 4}

    def save(self, action):
        self.saves += 1
        return {'claim_id': action['claim_id'], 'library_file_id': 'libfile_fixture',
                'file_id': 'file_fixture', 'version': 0}

    def send(self, action, *, text=None, attachments=None):
        if action.get('combined_question_response_required') and (not text or attachments != [action['library_file_id']]):
            raise ValueError('Fake native combined send requires answer and attachment')
        self.sends += 1
        self.calls.append({'text': text, 'attachments': attachments})
        return {'send_receipt': 'fake_message_receipt', 'send_accepted_at': '2026-10-29T00:00:00Z'}


class PlanTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp.name)
        self.database = self.base / 'metadata.sqlite'
        self.file = '11111111-1111-4111-8111-111111111111'
        self.event = 'evt_fixture_12345678'
        self.now = 1000
        with contextlib.closing(sqlite3.connect(self.database)) as db, db:
            db.executescript('CREATE TABLE images(id,mime,expires,idem,event,digest,owner); CREATE TABLE tokens(owner,scope,expires);')
            db.execute('INSERT INTO images VALUES(?,?,?,?,?,?,?)', (self.file, 'image/png', 2000000, 'user_submission_123', self.event, 'f' * 64, 'owner'))
            db.execute('INSERT INTO tokens VALUES(?,?,?)', ('owner', 'read subscribe', 2000000))
        self.restart()
        self.native = FakeNative()

    def restart(self):
        self.ledger = module.ledger_module.Ledger(self.database, self.base / 'map.json', clock=lambda: self.now)
        self.plan = module.AttachmentPlan(self.ledger)

    def tearDown(self):
        self.tmp.cleanup()

    def ready(self):
        action = self.plan.next(self.file, self.event)
        self.assertEqual(action['next_action'], 'read_source')
        self.plan.source_ready(self.file, self.event, self.native.read(action))
        return self.plan.next(self.file, self.event, claim_id=action['claim_id'])

    def save(self):
        action = self.ready()
        self.assertEqual(action['next_action'], 'save_library')
        self.plan.record('begin-save', self.file, self.event, {'claim_id': action['claim_id']})
        self.plan.record('saved', self.file, self.event, self.native.save(action))

    def test_fake_end_to_end_and_duplicate_skip(self):
        self.save()
        action = self.plan.next(self.file, self.event, capabilities=['assistant_attach'])
        self.assertEqual(action['next_action'], 'send_attachment')
        self.assertTrue(action['capability_available'])
        self.plan.record('begin-send', self.file, self.event, {})
        self.plan.record('accepted', self.file, self.event, self.native.send(action))
        self.restart()
        replay = self.plan.next(self.file, self.event)
        self.assertEqual(replay['decision'], 'skip')
        self.assertEqual(replay['reason'], 'send_accepted')
        self.assertFalse(replay['user_visible_confirmed'])
        self.assertEqual((self.native.reads, self.native.saves, self.native.sends), (1, 1, 1))

    def test_saved_restart_source_expiry_uses_same_library_identity(self):
        self.save()
        self.now = 3000
        self.restart()
        action = self.plan.next(self.file, self.event)
        self.assertEqual(action['next_action'], 'send_attachment')
        self.assertEqual(action['library_file_id'], 'libfile_fixture')
        self.assertEqual((self.native.reads, self.native.saves), (1, 1))

    def test_generated_preflight_has_no_native_action(self):
        with contextlib.closing(sqlite3.connect(self.database)) as db, db:
            db.execute('UPDATE images SET idem=?', ('preflight_fixture',))
        result = self.plan.next(self.file, self.event)
        self.assertEqual(result['reason'], 'generated_preflight')
        self.assertNotIn('next_action', result)
        self.assertEqual(self.native.reads, 0)

    def test_unknown_create_or_send_holds_across_restart(self):
        action = self.ready()
        self.plan.record('begin-save', self.file, self.event, {'claim_id': action['claim_id']})
        self.plan.record('uncertain', self.file, self.event, {})
        self.restart()
        self.assertEqual(self.plan.next(self.file, self.event)['reason'], 'creating_uncertain')
        receipt = self.native.save(action)
        with self.assertRaises(ValueError):
            self.plan.record('saved', self.file, self.event, receipt)
        self.plan.record('saved', self.file, self.event, {**receipt, 'outcome_verified': True})
        self.plan.record('begin-send', self.file, self.event, {})
        self.plan.record('uncertain', self.file, self.event, {})
        self.restart()
        self.assertEqual(self.plan.next(self.file, self.event)['reason'], 'posting_uncertain')
        self.assertEqual(self.native.sends, 0)

    def test_absent_native_capability_is_explicit_and_never_executes(self):
        result = self.plan.next(self.file, self.event)
        self.assertEqual(result['required_capability'], 'authorized_get_image')
        self.assertFalse(result['capability_available'])
        self.assertFalse(result['automatic_execution'])
        self.assertEqual(self.native.reads, 0)
        self.assertEqual(self.plan.next(self.file, self.event)['reason'], 'worker_active')

    def test_wrong_receipt_and_event_cannot_advance(self):
        action = self.plan.next(self.file, self.event)
        receipt = self.native.read(action)
        with self.assertRaises(ValueError):
            self.plan.source_ready(self.file, self.event, {**receipt, 'sha256': '0' * 64})
        with self.assertRaises(ValueError):
            self.plan.record('begin-save', self.file, self.event, {'claim_id': action['claim_id']})
        with self.assertRaises(ValueError):
            self.plan.next(self.file, 'evt_different_1234')

    def test_expired_lease_requires_fresh_read_not_stale_staging_receipt(self):
        self.ready()
        self.now += 301
        self.restart()
        result = self.plan.next(self.file, self.event)
        self.assertEqual(result['next_action'], 'read_source')
        self.assertNotIn('staging_ref', result)

    def caption_save(self):
        with contextlib.closing(sqlite3.connect(self.database)) as db, db:
            db.execute('ALTER TABLE images ADD COLUMN caption BLOB')
            db.execute('UPDATE images SET caption=?', (b'opaque-ciphertext-never-read',))
        action = self.plan.next(self.file, self.event)
        metadata = metadata_fixture()
        self.plan.record('bind-submission', self.file, self.event, {'claim_id': action['claim_id'], 'metadata': metadata})
        self.plan.source_ready(self.file, self.event, self.native.read(action))
        save = self.plan.next(self.file, self.event, claim_id=action['claim_id'])
        self.plan.record('begin-save', self.file, self.event, {'claim_id': action['claim_id']})
        self.plan.record('saved', self.file, self.event, self.native.save(save))
        return metadata

    def test_caption_context_lost_on_restart_holds_after_source_expiry(self):
        metadata = self.caption_save()
        self.restart()
        self.assertEqual(self.plan.next(self.file, self.event)['next_action'], 'read_question_context')
        self.now = 3000
        self.assertEqual(self.plan.next(self.file, self.event)['reason'], 'caption_context_unavailable')
        restored = self.plan.next(self.file, self.event, submission_metadata=metadata)
        self.assertEqual(restored['next_action'], 'send_attachment')
        self.assertTrue(restored['combined_question_response_required'])
        self.assertEqual(self.native.sends, 0)

    def test_fake_combined_question_answer_attachment_is_one_send_and_duplicate_skip(self):
        metadata = self.caption_save()
        action = self.plan.next(self.file, self.event)
        self.assertTrue(action['combined_question_response_required'])
        digests = {k: metadata[k] for k in ('caption_sha256', 'submission_sha256')}
        self.plan.record('begin-send', self.file, self.event, {**digests, 'caption_context_verified': True})
        # One fake native call carries both fields, never two independent sends.
        with self.assertRaises(ValueError):self.native.send(action, attachments=[action['library_file_id']])
        receipt = self.native.send(action, text='这是测试图片的回答。', attachments=[action['library_file_id']])
        self.plan.record('accepted', self.file, self.event, {**receipt, **digests, 'question_response_included': True})
        self.restart()
        self.assertEqual(self.plan.next(self.file, self.event)['decision'], 'skip')
        self.assertEqual(len(self.native.calls), 1)
        self.assertEqual(self.native.calls[0]['attachments'], ['libfile_fixture'])
        self.assertTrue(self.native.calls[0]['text'])
        self.assertEqual(self.native.sends, 1)
        self.assertNotIn(metadata['caption'], self.ledger.path.read_text())

    def test_unknown_combined_send_holds_and_requires_actual_verified_receipt(self):
        metadata = self.caption_save()
        digests = {k: metadata[k] for k in ('caption_sha256', 'submission_sha256')}
        self.plan.record('begin-send', self.file, self.event, {**digests, 'caption_context_verified': True})
        self.plan.record('uncertain', self.file, self.event, {})
        self.restart()
        self.assertEqual(self.plan.next(self.file, self.event)['reason'], 'posting_uncertain')
        receipt = {**self.native.send({}), **digests, 'question_response_included': True}
        with self.assertRaises(ValueError):self.plan.record('accepted', self.file, self.event, receipt)
        self.plan.record('accepted', self.file, self.event, {**receipt, 'outcome_verified': True})
        self.assertEqual(self.plan.next(self.file, self.event)['decision'], 'skip')

    def test_old_terminal_receipts_without_event_skip_no_reads_or_sends(self):
        self.ledger.claim(self.file, self.event)
        for state in ('send_accepted', 'user_visible', 'library_deleted'):
            with self.ledger.transaction() as data:
                data['items'][0].update(state=state, library_file_id='libfile_legacy')
                data['items'][0].pop('event_id', None)
            self.now = 3000  # expired source does not require new reads
            self.restart()
            result = self.plan.next(self.file, self.event, submission_metadata=metadata_fixture())
            self.assertEqual(result['decision'], 'skip')
            self.assertNotIn('next_action', result)
            with self.assertRaises(ValueError):self.plan.record('begin-send', self.file, self.event, {})
        self.assertEqual((self.native.reads, self.native.saves, self.native.sends), (0, 0, 0))
        with self.ledger.transaction() as data:data['items'][0]['state'] = 'library_saved'
        self.assertEqual(self.plan.next(self.file, self.event)['reason'], 'legacy_event_missing')
        with self.ledger.transaction() as data:data['items'][0]['event_id'] = 'evt_other_12345678'
        with self.assertRaises(ValueError):self.plan.next(self.file, self.event)


if __name__ == '__main__':
    unittest.main()
