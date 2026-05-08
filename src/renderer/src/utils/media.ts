import { AUDIO_EXTENSIONS, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from '../../../shared/media';

export function isImageExtension(extension: string): boolean {
  return IMAGE_EXTENSIONS.has(extension);
}

export function isVideoExtension(extension: string): boolean {
  return VIDEO_EXTENSIONS.has(extension);
}

export function isAudioExtension(extension: string): boolean {
  return AUDIO_EXTENSIONS.has(extension);
}
