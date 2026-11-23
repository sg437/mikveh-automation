#!/bin/bash
# בשיחות Claude Code בענן: מכין גישה ל-Firebase מתוך מפתח ה-Service Account
# שנשמר בהגדרות הסביבה (FIREBASE_SA_B64, בקידוד base64). המפתח נכתב לקובץ
# מחוץ לפרויקט, עם הרשאות קריאה לבעלים בלבד, ולעולם לא מודפס.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# כלי Firebase: מותקן בדרך כלל על ידי סקריפט ההכנה של הסביבה; כאן רק אם חסר
if ! command -v firebase >/dev/null 2>&1; then
  npm install -g firebase-tools >/dev/null 2>&1 || echo "session-start: firebase-tools install failed" >&2
fi

if [ -z "${FIREBASE_SA_B64:-}" ]; then
  exit 0
fi

key_file="$HOME/.config/firebase/service-account.json"
mkdir -p "$(dirname "$key_file")"
umask 077
if printf '%s' "$FIREBASE_SA_B64" | base64 -d > "$key_file.tmp" 2>/dev/null \
   && grep -q '"type": *"service_account"' "$key_file.tmp"; then
  mv "$key_file.tmp" "$key_file"
  chmod 600 "$key_file"
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo "export GOOGLE_APPLICATION_CREDENTIALS=\"$key_file\"" >> "$CLAUDE_ENV_FILE"
  fi
else
  rm -f "$key_file.tmp"
  echo "session-start: FIREBASE_SA_B64 is not a valid base64 service-account key" >&2
fi
