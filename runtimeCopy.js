// GJS caches ES modules by URI: hot reload imports a fresh copy of the
// extension's modules from a new temporary directory instead.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const SKIPPED = new Set(['node_modules', 'tests', 'tools', 'agents', '.git']);

const copyModules = (source, destination) => {
  destination.make_directory(null);
  const children = source.enumerate_children(
    'standard::name,standard::type',
    Gio.FileQueryInfoFlags.NONE,
    null
  );
  try {
    for (const info of children) {
      const name = info.get_name();
      if (SKIPPED.has(name)) continue;
      const from = source.get_child(name);
      const to = destination.get_child(name);
      if (info.get_file_type() === Gio.FileType.DIRECTORY) {
        copyModules(from, to);
      } else if (/\.(js|css)$/.test(name)) {
        from.copy(to, Gio.FileCopyFlags.NONE, null, null);
      }
    }
  } finally {
    children.close(null);
  }
};

const deleteDirectory = (directory) => {
  const children = directory.enumerate_children(
    'standard::name,standard::type',
    Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
    null
  );
  try {
    for (const info of children) {
      const child = directory.get_child(info.get_name());
      if (info.get_file_type() === Gio.FileType.DIRECTORY) {
        deleteDirectory(child);
      } else {
        child.delete(null);
      }
    }
  } finally {
    children.close(null);
  }
  directory.delete(null);
};

export const removeRuntimeCopy = (directory) => {
  try {
    deleteDirectory(directory);
  } catch (err) {
    console.warn(`d2da: runtime cleanup failed: ${err.message}`);
  }
};

export const importRuntimeCopy = async (source) => {
  const parent = Gio.File.new_for_path(
    GLib.dir_make_tmp('d2da-runtime-XXXXXX')
  );
  const directory = parent.get_child('code');
  try {
    copyModules(source, directory);
    const module = await import(directory.get_child('runtime.js').get_uri());
    return {
      Runtime: module.Dash2DockRuntime,
      directory: parent,
      stylesheet: directory.get_child('stylesheet.css'),
    };
  } catch (err) {
    removeRuntimeCopy(parent);
    throw err;
  }
};
