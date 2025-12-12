import type { Image } from './image.js';
import type { URL } from './url.js';

export interface AsyncImageProvider {
  (): Promise<Image | URL>;
  lastImage(): Promise<Image | URL>;
}
