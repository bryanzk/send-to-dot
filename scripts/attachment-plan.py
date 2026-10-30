"""Metadata-only action planner. Never executes native reads, Library saves or sends."""
import argparse
import importlib.util
import json
import re
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('attachment_ledger', ROOT / 'attachment_ledger.py')
ledger_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ledger_module)


class AttachmentPlan:
    def __init__(self, ledger):
        self.ledger = ledger
        # A fresh process must revalidate actual metadata/context. Never persist
        # the question or a durable claim that an agent still remembers it.
        self._caption_context = {}

    def _identity(self, file_id, event_id):
        if str(uuid.UUID(file_id)) != file_id or not re.fullmatch(r'evt_[A-Za-z0-9_-]{8,100}', event_id):
            raise ValueError('Invalid source identifiers')
        with self.ledger.transaction() as data:
            item = next((x for x in data['items'] if x['source_file_id'] == file_id), None)
            if item and item.get('event_id') and item['event_id'] != event_id:
                raise ValueError('Event/file mismatch')
            return dict(item) if item else None

    @staticmethod
    def _native(action, capability, capabilities, **metadata):
        return {'decision': 'native_action_required', 'next_action': action,
                'required_capability': capability, 'capability_available': capability in capabilities,
                'automatic_execution': False, 'user_visible_confirmed': False, **metadata}

    def next(self, file_id, event_id, claim_id=None, capabilities=(), submission_metadata=None):
        item = self._identity(file_id, event_id)
        if item and (item['state'] in ('send_accepted', 'user_visible', 'library_deleted') or not item.get('event_id')):
            # Legacy terminal receipts without event_id are skip-only; never
            # fabricate a historical event or bind a new question on replay.
            result = self.ledger.claim(file_id, event_id)
            return {**result, 'automatic_execution': False, 'user_visible_confirmed': False}
        if submission_metadata is not None:
            self.record('bind-submission', file_id, event_id, {'claim_id': claim_id, 'metadata': submission_metadata})
            item = self._identity(file_id, event_id)
        if item and item['state'] == 'claimed' and claim_id == item.get('claim_id') and item.get('lease_until', 0) > self.ledger.clock():
            source = self.ledger.source(file_id, event_id)
            result = source if 'decision' in source else {'decision': 'prepare', **item}
        else:
            result = self.ledger.claim(file_id, event_id)
        if result['decision'] == 'prepare' and item and item.get('claim_id') != result['claim_id']:
            # A newly leased worker must obtain its own authorized native read;
            # an old staging receipt alone does not establish a live staged file.
            with self.ledger.transaction() as data:
                current = next(x for x in data['items'] if x['source_file_id'] == file_id)
                if current.get('claim_id') == result['claim_id']:
                    current.pop('source_receipt', None)
            result.pop('source_receipt', None)
        if result['decision'] == 'reuse':
            question = result.get('question_present', False)
            digests = {k: result[k] for k in ('caption_sha256', 'submission_sha256') if k in result}
            if question and self._caption_context.get(file_id) != (result.get('caption_sha256'), result.get('submission_sha256')):
                source = self.ledger.source(file_id, event_id)
                if source.get('decision'):
                    return {'decision': 'hold', 'reason': 'caption_context_unavailable', 'requires_caption_context': True,
                            'automatic_execution': False, 'user_visible_confirmed': False, **digests}
                return self._native('read_question_context', 'authorized_get_image', capabilities,
                                    source_file_id=file_id, event_id=event_id, requires_caption_context=True,
                                    after_success='bind-submission', **digests)
            return self._native('send_attachment', 'assistant_attach', capabilities,
                                source_file_id=file_id, event_id=event_id,
                                library_file_id=result['library_file_id'], file_id=result['file_id'], version=result['version'],
                                before_call='begin-send', after_success='accepted', on_unknown='uncertain',
                                requires_caption_context=question, combined_question_response_required=question, **digests)
        if result['decision'] != 'prepare':
            return {**result, 'automatic_execution': False, 'user_visible_confirmed': False}
        common = dict(source_file_id=file_id, event_id=event_id, claim_id=result['claim_id'],
                      question_present=result.get('question_present', False))
        if result.get('question_present') and not result.get('caption_sha256'):
            return self._native('read_source', 'authorized_get_image', capabilities, **common,
                                expected_mime=result['mime'], expected_sha256=result['source_sha256'],
                                source_expires_at=result['source_expires_at'], after_success='bind-submission_then_source-ready')
        if result.get('source_receipt'):
            return self._native('save_library', 'library_save', capabilities, **common,
                                staging_ref=result['source_receipt']['staging_ref'],
                                before_call='begin-save', after_success='saved', on_unknown='uncertain')
        return self._native('read_source', 'authorized_get_image', capabilities, **common,
                            expected_mime=result['mime'], expected_sha256=result['source_sha256'],
                            source_expires_at=result['source_expires_at'], after_success='source-ready')

    def source_ready(self, file_id, event_id, receipt):
        existing = self._identity(file_id, event_id)
        if existing and not existing.get('event_id'):
            raise ValueError('Legacy event identity must be resolved without new native operations')
        # The trusted native adapter must perform these checks on actual bytes. This
        # method only records its bounded metadata receipt; it does not verify bytes.
        allowed = {'claim_id', 'staging_ref', 'mime', 'sha256', 'byte_length', 'width', 'height'}
        if set(receipt) != allowed or not re.fullmatch(r'stage_[A-Za-z0-9_-]{8,100}', receipt.get('staging_ref', '')):
            raise ValueError('Bounded staging metadata receipt required')
        for key in ('byte_length', 'width', 'height'):
            if type(receipt[key]) is not int or receipt[key] <= 0:
                raise ValueError('Positive integer image bounds required')
        if receipt['byte_length'] > 8388608 or receipt['width'] * receipt['height'] > 16000000:
            raise ValueError('Image limits exceeded')
        with self.ledger.transaction() as data:
            item = next(x for x in data['items'] if x['source_file_id'] == file_id)
            if item['state'] != 'claimed' or item['claim_id'] != receipt['claim_id'] or item.get('lease_until', 0) <= self.ledger.clock():
                raise ValueError('Valid exclusive claim required')
            if self.ledger.source(file_id, event_id).get('decision'):
                raise ValueError('Source no longer authorized')
            if receipt['mime'] != item['mime'] or receipt['sha256'] != item['source_sha256']:
                raise ValueError('Source metadata mismatch')
            item['source_receipt'] = {k: v for k, v in receipt.items() if k != 'claim_id'}
        return {'state': 'source_ready', 'claim_id': receipt['claim_id'], 'automatic_execution': False}

    def record(self, action, file_id, event_id, payload):
        item = self._identity(file_id, event_id)
        if item and not item.get('event_id'):
            raise ValueError('Legacy records without event identity are skip/hold only')
        if action == 'begin-save' and (not item or not item.get('source_receipt')):
            raise ValueError('Read and validate source before saving')
        action = {'begin-save': 'begin-create', 'begin-send': 'begin-post'}.get(action, action)
        result = self.ledger.transition(file_id, action, payload)
        if action == 'bind-submission':
            self._caption_context[file_id] = (result['caption_sha256'], result['submission_sha256'])
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['next', 'source-ready', 'bind-submission', 'begin-save', 'saved', 'begin-send', 'accepted', 'uncertain'])
    parser.add_argument('file_id')
    parser.add_argument('event_id')
    parser.add_argument('--claim-id')
    parser.add_argument('--context-stdin', action='store_true', help='Revalidate actual authorized submission metadata from bounded JSON stdin, never from CLI text')
    parser.add_argument('--capabilities', default='', help='Comma-separated currently available native capabilities; never authorizes an action')
    args = parser.parse_args()
    # Read only the approved database path, never credential files or image bodies.
    config = json.loads((ROOT / 'approved.config.json').read_text())
    database = Path(config['database']).resolve()
    if not database.is_relative_to(ROOT / 'state'):
        raise ValueError('Approved database required')
    planner = AttachmentPlan(ledger_module.Ledger(database, ROOT / 'state/attachment-map.json'))
    if args.action == 'next':
        metadata = None
        if args.context_stdin:
            raw = sys.stdin.read(16385)
            if len(raw) > 16384:
                raise ValueError('Metadata payload exceeds limit')
            metadata = json.loads(raw)
        result = planner.next(args.file_id, args.event_id, args.claim_id, args.capabilities.split(','), metadata)
    else:
        raw = sys.stdin.read(16385)
        if len(raw) > 16384:
            raise ValueError('Metadata payload exceeds limit')
        payload = json.loads(raw)
        if args.action == 'source-ready':
            result = planner.source_ready(args.file_id, args.event_id, payload)
        else:
            result = planner.record(args.action, args.file_id, args.event_id, payload)
    print(json.dumps(result))


if __name__ == '__main__':
    main()
