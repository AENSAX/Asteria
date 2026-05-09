export const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "avif",
  "heic",
  "heif",
  "ico",
  "jfif",
  "tif",
  "tiff",
  "svg",
]);

export const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "mkv",
  "mov",
  "webm",
  "avi",
  "wmv",
  "m4v",
  "mpg",
  "mpeg",
  "ts",
  "m2ts",
  "3gp",
]);

export const AUDIO_EXTENSIONS = new Set([
  "mp3",
  "flac",
  "wav",
  "ogg",
  "m4a",
  "aac",
  "opus",
  "wma",
  "aiff",
  "aif",
]);

export const MEDIA_EXTENSIONS = new Set([
  ...IMAGE_EXTENSIONS,
  ...VIDEO_EXTENSIONS,
  ...AUDIO_EXTENSIONS,
]);

export const WEB_MEDIA_MIME_EXTENSIONS = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
  ["image/bmp", "bmp"],
  ["image/avif", "avif"],
  ["image/heic", "heic"],
  ["image/heif", "heif"],
  ["image/svg+xml", "svg"],
  ["video/mp4", "mp4"],
  ["video/webm", "webm"],
  ["video/quicktime", "mov"],
  ["video/x-matroska", "mkv"],
  ["audio/mpeg", "mp3"],
  ["audio/flac", "flac"],
  ["audio/wav", "wav"],
  ["audio/ogg", "ogg"],
  ["audio/mp4", "m4a"],
  ["audio/aac", "aac"],
  ["audio/opus", "opus"],
]);
