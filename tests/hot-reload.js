// Hot reload lifecycle check, run by `make test-hot-reload` through
// gnome-shell-test-tool in a headless shell with the packed extension.

import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

const UUID = 'dash2dock-lite@icedman.github.com';
const DOCK_SETTLE_MS = 1_500;

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const write = (file, text) => GLib.file_set_contents(file.get_path(), text);
const read = (file) =>
  new TextDecoder().decode(GLib.file_get_contents(file.get_path())[1]);
const stageDocks = () =>
  Main.uiGroup
    .get_children()
    .filter((child) => child.get_name() === 'dashtodockContainer');
const hasOwnDocks = (runtime) =>
  runtime.docks.length > 0 &&
  stageDocks().length === runtime.docks.length &&
  runtime.docks.every((dock) => stageDocks().includes(dock));
const reloadAndSettle = async (extension) => {
  await extension._hotReload();
  await Scripting.sleep(DOCK_SETTLE_MS);
};

let finished = false;

export const run = async () => {
  await Scripting.sleep(DOCK_SETTLE_MS);
  const extension = Main.extensionManager.lookup(UUID)?.stateObj;
  assert(extension?._runtime, 'Loader runtime missing');
  assert(hasOwnDocks(extension._runtime), 'Initial docks missing');

  const entry = extension.dir.get_child('runtime.js');
  const original = read(entry);

  const first = extension._runtime;
  const firstDocks = [...first.docks];
  await reloadAndSettle(extension);
  assert(extension._runtime !== first, 'Reload reused the old runtime');
  assert(first.integrations === null, 'Old runtime was not disabled');
  assert(
    firstDocks.every((dock) => !stageDocks().includes(dock)),
    'Old docks stayed on stage'
  );
  assert(hasOwnDocks(extension._runtime), 'Reloaded runtime has no docks');
  assert(extension._copy, 'Fresh module copy missing');

  const secondCopy = extension._copy.directory;
  await reloadAndSettle(extension);
  assert(!secondCopy.query_exists(null), 'Previous module copy was not removed');

  const healthy = extension._runtime;
  write(entry, 'invalid javascript !!!');
  let importFailed = false;
  try {
    await extension._hotReload();
  } catch {
    importFailed = true;
  } finally {
    write(entry, original);
  }
  assert(importFailed, 'Import failure was not propagated');
  assert(extension._runtime === healthy, 'Import failure replaced the runtime');
  assert(hasOwnDocks(healthy), 'Import failure broke the running docks');

  write(
    entry,
    original.replace(
      "console.log('dash2dock-lite enabled');",
      "throw new Error('activation test');"
    )
  );
  let activationFailed = false;
  try {
    await extension._hotReload();
  } catch {
    activationFailed = true;
  } finally {
    write(entry, original);
  }
  await Scripting.sleep(DOCK_SETTLE_MS);
  assert(activationFailed, 'Activation failure was not propagated');
  assert(extension._runtime === healthy, 'Previous runtime was not restored');
  assert(hasOwnDocks(healthy), 'Rollback did not restore the docks');

  const beforeMarker = extension._runtime;
  write(extension.dir.get_child('.reload'), String(GLib.get_monotonic_time()));
  const deadline = Date.now() + 6_000;
  while (extension._runtime === beforeMarker && Date.now() < deadline)
    await Scripting.sleep(100);
  assert(extension._runtime !== beforeMarker, 'Marker did not trigger a reload');
  await Scripting.sleep(DOCK_SETTLE_MS);
  assert(hasOwnDocks(extension._runtime), 'Marker reload has no docks');

  const latestRuntimeClass = extension._runtime.constructor;
  const pending = extension._hotReload();
  extension.disable();
  await pending;
  await Scripting.sleep(DOCK_SETTLE_MS);
  assert(stageDocks().length === 0, 'Pending reload resurrected the docks');
  assert(extension._reloadTimer === 0, 'Reload timer survived disable');
  assert(!extension._copy, 'Runtime copy survived disable');

  extension.enable();
  await Scripting.sleep(DOCK_SETTLE_MS);
  assert(
    extension._runtime.constructor === latestRuntimeClass,
    'Re-enable used stale runtime code'
  );
  assert(hasOwnDocks(extension._runtime), 'Re-enable has no docks');

  finished = true;
  console.log(
    'd2da hot reload check: swaps, import failure, rollback, marker, disable race passed'
  );
};

export const finish = () => assert(finished, 'Hot reload checks did not finish');
