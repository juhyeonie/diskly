import React from 'react';
import * as Lucide from 'lucide-react';

export const Icon = ({ name, size = 16, sw = 1.75, style }) => {
  const C = Lucide[name] || Lucide.File;
  return <C size={size} strokeWidth={sw} style={{ display: 'block', flexShrink: 0, ...style }} />;
};
