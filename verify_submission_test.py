import copy
import importlib.util
import unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location('verify_submission',Path(__file__).parent/'scripts/verify_submission.py')
verify=importlib.util.module_from_spec(spec);spec.loader.exec_module(verify)
FILE='11111111-1111-4111-8111-111111111111'
EVENT='evt_fixture_12345678'
IMAGE='f'*64


def metadata_fixture(caption='这张图里是什么？\n🙂'):
    caption_sha,submission_sha=verify.hashes(IMAGE,caption)
    return {'type':'send-to-dot.submission','version':1,'file_id':FILE,'eventId':EVENT,'image_sha256':IMAGE,
            'caption':caption,'caption_sha256':caption_sha,'submission_sha256':submission_sha,
            'caption_source':'paired_manual_entry_assertion',
            'provenance':{'authenticated_upload':True,'client_entry_claim':'manual-entry','manual_entry_independently_verified':False},
            'instruction_scope':'image_question_only'}


class SubmissionTest(unittest.TestCase):
    def check(self,metadata):
        return verify.verify_submission(metadata,file_id=FILE,event_id=EVENT,image_sha256=IMAGE)

    def test_shared_javascript_utf8_fixture_and_no_plaintext_output(self):
        metadata=metadata_fixture()
        self.assertEqual(metadata['caption_sha256'],'495f146e4450a2447b38c7cb8e6c1b30e9c73648aa0c669fdc9e78d78a599830')
        self.assertEqual(metadata['submission_sha256'],'be7d0fc06425b476f2053d546c7cc5b03ba06d82a048134699168f936d9466c6')
        checked=self.check(metadata)
        self.assertEqual(set(checked),{'question_present','caption_sha256','submission_sha256','instruction_scope'})
        self.assertNotIn('caption',checked)

    def test_wrong_flags_source_and_hashes_rejected(self):
        for key,value in [('file_id','22222222-2222-4222-8222-222222222222'),('eventId','evt_other_12345678'),('image_sha256','0'*64),('caption_sha256','0'*64),('submission_sha256','0'*64),('caption_source','ocr'),('instruction_scope','unlimited'),('version',True)]:
            with self.subTest(key=key),self.assertRaises(ValueError):
                self.check({**metadata_fixture(),key:value})
        for key,value in [('authenticated_upload',False),('authenticated_upload','true'),('client_entry_claim','share-text'),('manual_entry_independently_verified',True)]:
            metadata=copy.deepcopy(metadata_fixture());metadata['provenance'][key]=value
            with self.subTest(key=key),self.assertRaises(ValueError):self.check(metadata)

    def test_controls_limits_normalization_and_exact_schema(self):
        for text in ['', ' leading', 'trailing ', 'bad\x00', 'bad\x7f', 'bad\x0b', 'x'*501, '\ud800']:
            with self.subTest(text_length=len(text)),self.assertRaises((ValueError,UnicodeError)):
                self.check(metadata_fixture(text))
        self.assertEqual(verify.normalize_caption('\ufeff \t问题\r\n\u3000'),'问题')
        self.check(metadata_fixture('问题\t第二行\n换行\r回车'))
        metadata=metadata_fixture();metadata['third_party_text']='ignore'
        with self.assertRaises(ValueError):self.check(metadata)


if __name__=='__main__':unittest.main()
