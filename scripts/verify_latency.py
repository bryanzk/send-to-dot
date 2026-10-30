"""Score phone tap -> actual original-dot image pixels using one recording.
The agent must actually review the specified UI frames. API/server acceptance is
explicitly invalid evidence. Frame timestamps come from the media, not chat time.
"""
import argparse,hashlib,json,re,subprocess
from pathlib import Path

def evaluate(evidence,frame_seconds,recording_sha256):
    bad=lambda reason:{'verdict':'INVALID_EVIDENCE','reason':reason,'pass':False}
    if not isinstance(evidence,dict)or evidence.get('source')!='single_continuous_recording':return bad('same_recording_required')
    if evidence.get('recording_sha256')!=recording_sha256:return bad('recording_digest_mismatch')
    if not re.fullmatch(r'STDOT-[A-Z0-9]{8,32}',evidence.get('marker','')):return bad('unique_test_marker_required')
    if not evidence.get('conversation_id')or evidence.get('visible_conversation_id')!=evidence['conversation_id']:return bad('original_conversation_not_verified')
    start=evidence.get('phone_start',{})
    if start.get('kind')!='phone_tap_send'or start.get('ui_reviewed')is not True or start.get('marker')!=evidence['marker']:return bad('actual_phone_tap_frame_required')
    def time_for(observation):
        i=observation.get('frame_index')
        if type(i)is not int or not 0<=i<len(frame_seconds):raise ValueError('Frame outside recording')
        return frame_seconds[i]
    try:
        t0=time_for(start);end=evidence.get('dot_visible')
        if end is not None:
            if end.get('kind')!='original_image_pixels_visible'or end.get('ui_reviewed')is not True or end.get('marker')!=evidence['marker']:return bad('visible_original_image_frame_required')
            elapsed=(time_for(end)-t0)*1000
            if elapsed<0:return bad('visibility_precedes_tap')
            return {'verdict':'PASS'if elapsed<=30000 else'FAIL','pass':elapsed<=30000,'elapsed_ms':round(elapsed,2),'limit_ms':30000,'evidence':'reviewed_UI_frames_from_same_recording','delivery_api_acceptance_is_not_visibility':True}
        deadline=evidence.get('deadline',{})
        if deadline.get('kind')!='image_absent_through_deadline'or deadline.get('ui_reviewed')is not True or deadline.get('continuous_review')is not True:return bad('deadline_observation_required')
        elapsed=(time_for(deadline)-t0)*1000
        if elapsed<30000:return bad('recording_does_not_cover_30_seconds')
        return {'verdict':'FAIL','pass':False,'reason':'original_image_not_visible_by_30_seconds','observed_ms':round(elapsed,2),'limit_ms':30000}
    except (ValueError,TypeError,KeyError):return bad('invalid_frame_observation')

def verify(recording,evidence,probe='ffprobe'):
    path=Path(recording).resolve(strict=True)
    digest=hashlib.sha256()
    with path.open('rb')as f:
        for b in iter(lambda:f.read(1048576),b''):digest.update(b)
    result=subprocess.run([probe,'-v','error','-select_streams','v:0','-show_entries','frame=best_effort_timestamp_time','-of','json',str(path)],capture_output=True,timeout=120,check=True)
    frames=[float(x['best_effort_timestamp_time'])for x in json.loads(result.stdout)['frames']]
    if not frames or any(b<a for a,b in zip(frames,frames[1:])):raise ValueError('Monotonic media frame times required')
    return evaluate(evidence,frames,digest.hexdigest())
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('recording');p.add_argument('evidence');args=p.parse_args()
    try:r=verify(args.recording,json.loads(Path(args.evidence).read_text()))
    except Exception:r={'verdict':'INVALID_EVIDENCE','pass':False,'reason':'recording_or_review_unavailable'}
    print(json.dumps(r));raise SystemExit(0 if r['pass']else 1)
