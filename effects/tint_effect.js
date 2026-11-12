// Adapted from Blur-My-Shell

'use strict';

import { ColorShaderEffect } from './color_shader_effect.js';
import { registerClass } from '../gtype.js';

export const TintEffect = registerClass(
  {},
  class D2DATintEffect extends ColorShaderEffect {
    _init(params = {}) {
      super._init(params, 'tint_effect.glsl');
    }
  }
);
