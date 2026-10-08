"""بيشغّل أمر في جلسة مستقلة تمامًا (setsid) فميموتش لما الأب يخلص.

ليه: الحارس بيتشغّل من launchd، وlaunchd بيقتل كل مجموعة العمليات لما
السكربت يخلص. `nohup ... &` و`disown` مش بيحموا من ده — المحوّل كان
بيشتغل ويموت كل 6 دقايق. start_new_session=True بتعمل setsid حقيقي.

    python3 spawn_detached.py <ملف-اللوج> <الأمر> [معاملات...]
"""
import os
import subprocess
import sys

if len(sys.argv) < 3:
    sys.exit("الاستخدام: spawn_detached.py <logfile> <cmd> [args...]")

log, cmd = sys.argv[1], sys.argv[2:]
with open(log, "ab") as f:
    subprocess.Popen(cmd, stdout=f, stderr=f, stdin=subprocess.DEVNULL,
                     start_new_session=True, cwd=os.getcwd())
