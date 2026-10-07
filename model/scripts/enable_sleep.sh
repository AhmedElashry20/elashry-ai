#!/bin/bash
# بيرجّع النوم الطبيعي للجهاز (يقفل الشاشة → ينام). لازم يتشغّل بـ sudo.
set -x
# 1) شيل الـ daemon اللي بيمنع النوم كل ما الجهاز يقوم
launchctl bootout system /Library/LaunchDaemons/com.elashry.nosleep.plist 2>/dev/null
rm -f /Library/LaunchDaemons/com.elashry.nosleep.plist
# 2) فعّل النوم تاني
pmset -a disablesleep 0
# 3) رجّع نوم الشاشة بعد 10 دقايق (كان 0 = عمره ما ينام)
pmset -a displaysleep 10
set +x
echo
echo "--- النتيجة ---"
pmset -g | grep -iE "SleepDisabled|displaysleep|^ sleep"
