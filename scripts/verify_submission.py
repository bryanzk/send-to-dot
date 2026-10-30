"""Verify a connector's manual-question assertion; output only bounded digests.

This checks integrity and the paired-client assertion, not physical human entry.
Metadata must come from the authorized get_image result, never OCR or event text.
"""
import argparse
import hashlib
import json
import re
import sys

HEX = re.compile(r'[0-9a-f]{64}')
JS_TRIM = '\u0009\u000b\u000c\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\ufeff\u000a\u000d\u2028\u2029'


def normalize_caption(value):
    if not isinstance(value, str):
        raise ValueError('Caption must be a string')
    try:
        encoded = value.encode('utf-8')
    except UnicodeError:
        raise ValueError('Invalid caption encoding') from None
    if len(value) > 500 or len(encoded) > 2048 or any((ord(c) < 32 and c not in '\t\n\r') or ord(c) == 127 for c in value):
        raise ValueError('Caption limits exceeded')
    result = value.strip(JS_TRIM)
    if len(result) > 500 or len(result.encode('utf-8')) > 2048:
        raise ValueError('Caption limits exceeded')
    return result


def hashes(image_sha256, normalized_caption):
    if not isinstance(image_sha256, str) or HEX.fullmatch(image_sha256) is None:
        raise ValueError('Invalid image digest')
    caption_sha = hashlib.sha256(normalized_caption.encode('utf-8')).hexdigest()
    body = json.dumps(['send-to-dot/submission/v1', image_sha256, normalized_caption], ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    return caption_sha, hashlib.sha256(body).hexdigest()


def verify_submission(metadata, *, file_id, event_id, image_sha256):
    required = {'type', 'version', 'file_id', 'eventId', 'image_sha256', 'caption', 'caption_sha256', 'submission_sha256', 'caption_source', 'provenance', 'instruction_scope'}
    if not isinstance(metadata, dict) or set(metadata) != required:
        raise ValueError('Exact submission metadata required')
    if metadata['type'] != 'send-to-dot.submission' or type(metadata['version']) is not int or metadata['version'] != 1:
        raise ValueError('Unsupported submission metadata')
    if metadata['file_id'] != file_id or metadata['eventId'] != event_id or metadata['image_sha256'] != image_sha256:
        raise ValueError('Submission source mismatch')
    provenance = metadata['provenance']
    if metadata['caption_source'] != 'paired_manual_entry_assertion' or metadata['instruction_scope'] != 'image_question_only' or not isinstance(provenance, dict) or set(provenance) != {'authenticated_upload', 'client_entry_claim', 'manual_entry_independently_verified'}:
        raise ValueError('Unsupported caption provenance')
    if provenance['authenticated_upload'] is not True or provenance['client_entry_claim'] != 'manual-entry' or provenance['manual_entry_independently_verified'] is not False:
        raise ValueError('Invalid paired-client assertion')
    caption = normalize_caption(metadata['caption'])
    if not caption or caption != metadata['caption']:
        raise ValueError('Nonempty server-normalized caption required')
    caption_sha, submission_sha = hashes(image_sha256, caption)
    if metadata['caption_sha256'] != caption_sha or metadata['submission_sha256'] != submission_sha:
        raise ValueError('Submission digest mismatch')
    return {'question_present': True, 'caption_sha256': caption_sha, 'submission_sha256': submission_sha,
            'instruction_scope': 'image_question_only'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('file_id')
    parser.add_argument('event_id')
    parser.add_argument('image_sha256')
    args = parser.parse_args()
    raw = sys.stdin.read(16385)
    if len(raw) > 16384:
        raise ValueError('Submission metadata exceeds limit')
    result = verify_submission(json.loads(raw), file_id=args.file_id, event_id=args.event_id, image_sha256=args.image_sha256)
    print(json.dumps(result))


if __name__ == '__main__':
    main()
