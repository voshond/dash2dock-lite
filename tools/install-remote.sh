#!/bin/sh
# Installs this tree as dash2dock-lite on a remote GNOME host over SSH and
# hot reloads the running dock there (no logout once the loader is running).
#
# Usage: tools/install-remote.sh HOST
#   HOST  an SSH host (alias from ~/.ssh/config or user@host)
#
# Syncs the files (same set as `make install`), compiles the schemas on the
# host, then writes the .reload marker last so the loader only picks up a
# complete install. Waits a few seconds for the loader's journal message.
# The first install of the loader itself still needs one logout on the host.

set -eu

UUID=dash2dock-lite@icedman.github.com
HOST=${1:-}
REPO=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DEST=".local/share/gnome-shell/extensions/$UUID"

if [ -z "$HOST" ]; then
	echo "usage: $0 HOST" >&2
	exit 2
fi

echo "syncing $REPO -> $HOST:~/$DEST"
ssh "$HOST" "mkdir -p ~/$DEST"
rsync -a --delete --delete-excluded \
	--filter 'P .reload' \
	--exclude '*.zip' \
	--exclude '.*' \
	--exclude node_modules \
	--exclude build \
	--exclude tests \
	--exclude tools \
	--exclude screenshots \
	--exclude agents \
	--exclude plans \
	--exclude Makefile \
	--exclude eslint.config.js \
	--exclude package.json \
	--exclude package-lock.json \
	"$REPO/" "$HOST:$DEST/"

ssh "$HOST" sh -s -- "$UUID" <<'EOF'
set -eu
UUID=$1
DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=/run/user/$(id -u)/bus}"

glib-compile-schemas --strict "$DIR/schemas"

since=$(date '+%Y-%m-%d %H:%M:%S')
date +%s%N >"$DIR/.reload.tmp"
mv -f "$DIR/.reload.tmp" "$DIR/.reload"

state=$(gnome-extensions info "$UUID" 2>/dev/null | sed -n 's/^ *State: *//p')
if [ "$state" != "ACTIVE" ]; then
	echo "installed; extension state is '${state:-unknown}'."
	echo "enable it (gnome-extensions enable $UUID) or log out and back in once."
	exit 0
fi

i=0
while [ $i -lt 8 ]; do
	sleep 1
	result=$(journalctl --user -b --since "$since" -o cat 2>/dev/null |
		grep -E 'd2da: hot reload(ed| failed)' | tail -1 || true)
	case "$result" in
	*'hot reloaded'*)
		echo "hot reloaded on $(uname -n)"
		exit 0
		;;
	*'failed'*)
		echo "$result"
		echo "the previous dock keeps running; see journalctl --user -b | grep d2da"
		exit 1
		;;
	esac
	i=$((i + 1))
done

echo "installed, but the running dock did not hot reload."
echo "the session still runs a build without the hot reload loader: log out and back in once."
EOF
