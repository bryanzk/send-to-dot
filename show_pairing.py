"""USER runs this in their own Terminal; agent must never run/capture output."""
import os,sys,stat
from pathlib import Path
if not sys.stdout.isatty(): raise SystemExit('Use your own interactive Terminal; no redirection.')
kind=sys.argv[1] if len(sys.argv)>1 else ''
if kind not in ('phone','owner'): raise SystemExit('Choose phone or owner')
p=Path(__file__).resolve().parent/'.secrets'/('phone-upload' if kind=='phone' else 'owner-approval')
s=p.lstat()
if not stat.S_ISREG(s.st_mode) or s.st_uid!=os.getuid() or stat.S_IMODE(s.st_mode)!=0o600: raise SystemExit('Unsafe permissions')
print('PRIVATE: enter only into the approved '+('Send to dot phone pairing field' if kind=='phone' else 'private inbox OAuth owner approval field')+'. Never send in chat.')
print(p.read_text())
input('After using it, press Enter to clear the screen.')
print('\033[2J\033[H',end='')
