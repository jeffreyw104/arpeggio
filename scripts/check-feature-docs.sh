#!/usr/bin/env bash
# PreToolUse hook: before `git commit` or `git push`, warn (non-blocking)
# if src/ changed without a corresponding docs/features/*.md update.
# Triggered by Claude Code via the Bash matcher in .claude/settings.json.

payload=$(cat)
cmd=$(echo "$payload" | jq -r '.tool_input.command // ""' 2>/dev/null)
[ -z "$cmd" ] && exit 0

# Match `git commit` / `git push` (with or without `git -C <path>` prefix
# and regardless of flags / messages).
case "$cmd" in
  *"git commit"*|*"git -C"*"commit"*) action=commit ;;
  *"git push"*|*"git -C"*"push"*) action=push ;;
  *) exit 0 ;;
esac

# Run from the git repo root so paths compare cleanly.
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$root" || exit 0

# Build the file list relevant to the action.
if [ "$action" = "commit" ]; then
  files=$(git diff --cached --name-only 2>/dev/null)
else
  upstream=$(git rev-parse --abbrev-ref '@{u}' 2>/dev/null)
  if [ -n "$upstream" ]; then
    files=$(git diff --name-only "${upstream}..HEAD" 2>/dev/null)
  else
    # First push of a new branch: compare to main.
    files=$(git diff --name-only main..HEAD 2>/dev/null)
  fi
fi

# src/ touched but no docs/features/ touched?
has_src=$(echo "$files" | grep -E '^src/' | head -1)
has_docs=$(echo "$files" | grep -E '^docs/features/' | head -1)

if [ -n "$has_src" ] && [ -z "$has_docs" ]; then
  cat >&2 <<EOF
📝 docs/features/ reminder: this $action touches src/ but no docs/features/*.md.
   → Update the relevant feature md's Changes log, OR create a new
     docs/features/<letter>-<feature>.md if this introduces a new feature.
   → If this is a pure refactor / test / typo / chore, ignore this reminder.
EOF
fi
exit 0
