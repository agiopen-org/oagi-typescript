import type { Image } from './image.js';
import type { URL } from './url.js';

export interface ImageProvider {
  (): Image | URL;
  lastImage(): Image | URL;
}
