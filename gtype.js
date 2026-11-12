// GType names stay registered until logout: a hot reloaded copy of a module
// registers its classes under the next free name instead of colliding.

import GObject from 'gi://GObject';

const uniqueTypeName = (name) => {
  let typeName = `D2da_${name}`;
  for (let i = 1; GObject.type_from_name(typeName); i++) {
    typeName = `D2da_${name}_${i}`;
  }
  return typeName;
};

export const registerClass = (meta, klass) =>
  GObject.registerClass({ GTypeName: uniqueTypeName(klass.name), ...meta }, klass);
