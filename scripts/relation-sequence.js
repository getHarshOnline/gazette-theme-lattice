import { mountFieldSequence } from '@base/field-sequence';
import { createRelationRenderer } from './relation-renderer.js';
import * as model from '../shared/model.mjs';

export function mount({ element }) {
  const style = getComputedStyle(element);
  const roles = ['bloom-intensity','bloom-threshold','bloom-smoothing','bloom-radius','exposure','vignette-offset','vignette-darkness','noise-opacity'];
  const lighting = Object.fromEntries(roles.map(role=>[role.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),parseFloat(style.getPropertyValue('--material-field-'+role))]));
  return mountFieldSequence({ element, field:model.field, pixelRatio:model.pickPixelRatio, lighting,
    createRenderer: options => {
      const swatch = document.createElement('canvas');
      swatch.width = swatch.height = 1;
      const context = swatch.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Field material sampling unavailable');
      context.fillStyle = style.getPropertyValue('--material-field-ground').trim();
      context.fillRect(0, 0, 1, 1);
      const ground = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3).map(value => value / 255);
      return createRelationRenderer(model, { ...options, ground });
    } });
}
