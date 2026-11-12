/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 *
 */

// Hot reload loader: the dock lives in runtime.js. An install that rewrites
// the .reload marker swaps in a fresh copy of the runtime without a logout.

import GLib from 'gi://GLib';
import St from 'gi://St';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { Dash2DockRuntime } from './runtime.js';
import { importRuntimeCopy, removeRuntimeCopy } from './runtimeCopy.js';

const RELOAD_CHECK_SECONDS = 1;

let RuntimeClass = Dash2DockRuntime;

export default class Dash2DockLiteExt extends Extension {
  enable() {
    this._enabled = true;
    this._runtime = new RuntimeClass(this);
    this._runtime.enable();
    this._reloadToken = this._readReloadToken();
    this._reloadTimer = GLib.timeout_add_seconds(
      GLib.PRIORITY_DEFAULT,
      RELOAD_CHECK_SECONDS,
      () => {
        const token = this._readReloadToken();
        if (token && token !== this._reloadToken && !this._reloading) {
          this._reloadToken = token;
          this._hotReload().catch((err) =>
            console.error(`d2da: hot reload failed: ${err.stack ?? err}`)
          );
        }
        return GLib.SOURCE_CONTINUE;
      }
    );
  }

  _readReloadToken() {
    try {
      const [ok, contents] = GLib.file_get_contents(`${this.path}/.reload`);
      return ok ? new TextDecoder().decode(contents) : null;
    } catch {
      return null;
    }
  }

  async _hotReload() {
    if (!this._enabled || this._reloading) return;
    this._reloading = true;
    const currentRuntime = this._runtime;
    const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
    let next = null;
    let candidate = null;
    let previousDisabled = false;
    try {
      next = await importRuntimeCopy(this.dir);
      if (!this._enabled || this._runtime !== currentRuntime) return;
      theme.load_stylesheet(next.stylesheet);
      candidate = new next.Runtime(this);
      currentRuntime.disable();
      previousDisabled = true;
      candidate.enable();
      theme.unload_stylesheet(
        this._copy?.stylesheet ?? this.dir.get_child('stylesheet.css')
      );
      if (this._copy) removeRuntimeCopy(this._copy.directory);
      this._copy = next;
      this._runtime = candidate;
      RuntimeClass = next.Runtime;
      next = null;
      console.log('d2da: hot reloaded');
    } catch (err) {
      try {
        candidate?.disable();
      } catch (cleanupErr) {
        console.error(`d2da: hot reload cleanup failed: ${cleanupErr}`);
      }
      if (previousDisabled && this._enabled) currentRuntime.enable();
      throw err;
    } finally {
      if (next) {
        theme.unload_stylesheet(next.stylesheet);
        removeRuntimeCopy(next.directory);
      }
      this._reloading = false;
    }
  }

  disable() {
    this._enabled = false;
    if (this._reloadTimer) GLib.source_remove(this._reloadTimer);
    this._reloadTimer = 0;
    this._runtime?.disable();
    this._runtime = null;
    if (this._copy) {
      St.ThemeContext.get_for_stage(global.stage)
        .get_theme()
        .unload_stylesheet(this._copy.stylesheet);
      removeRuntimeCopy(this._copy.directory);
      this._copy = null;
    }
  }
}
