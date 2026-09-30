#!/bin/sh
# Paths are positional arguments, never evaluated shell source.
parent_pid=$1
install_root=$2
replacement=$3
backup=$4
executable=$5
status=$6
ready=$7
profile=$8
token=$9
version=${10}
started=${11}
no_sandbox=${12}
launch() {
  set --
  if [ -n "$profile" ]; then set -- "$@" "--user-data-dir=$profile"; fi
  if [ "$no_sandbox" = 1 ]; then set -- "$@" --no-sandbox; fi
  "$executable" "$@" >/dev/null 2>&1 &
  new_pid=$!
}
printf 'ready\n' > "$ready" || exit 1
attempt=0
while kill -0 "$parent_pid" 2>/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -gt 120 ]; then
    printf 'error: editor did not exit; installation unchanged\n' > "$status"
    exit 1
  fi
  sleep 1
done
unset ELECTRON_RUN_AS_NODE NODE_OPTIONS
if [ -e "$backup" ]; then
  printf 'error: backup already exists; installation unchanged\n' > "$status"
  launch
  exit 1
fi
if ! mv "$install_root" "$backup"; then
  printf 'error: cannot move current application\n' > "$status"
  launch
  exit 1
fi
if ! mv "$replacement" "$install_root"; then
  mv "$backup" "$install_root"
  printf 'error: replacement failed; previous application restored\n' > "$status"
  launch
  exit 1
fi
# Retain the backup for recovery. Do not claim success before spawning the app.
launch
healthy=0
if [ -n "$token" ]; then
  attempt=0
  while [ "$attempt" -lt 60 ] && kill -0 "$new_pid" 2>/dev/null; do
    if [ -f "$started" ]; then
      read -r actual_token actual_version actual_pid < "$started"
      if [ "$actual_token" = "$token" ] && [ "$actual_version" = "$version" ] && [ "$actual_pid" = "$new_pid" ]; then
        healthy=1
        break
      fi
    fi
    attempt=$((attempt + 1))
    sleep 1
  done
else
  sleep 2
  if kill -0 "$new_pid" 2>/dev/null; then healthy=1; fi
fi
if [ "$healthy" -ne 1 ]; then
  kill "$new_pid" 2>/dev/null
  wait "$new_pid" 2>/dev/null
  mv "$install_root" "$replacement"
  mv "$backup" "$install_root"
  printf 'error: new application did not become ready; previous application restored\n' > "$status"
  unset QUA_EDITOR_UPDATE_TOKEN
  launch
  exit 1
fi
printf 'installed\n' > "$status"
