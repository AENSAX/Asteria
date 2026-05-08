Place the bundled ffmpeg binary here.

Windows:
- resources/ffmpeg/ffmpeg.exe

Linux/macOS:
- resources/ffmpeg/ffmpeg

Asteria resolves ffmpeg in this order:
1. Packaged app resources: process.resourcesPath/ffmpeg
2. Project resources directory: resources/ffmpeg
3. System PATH: ffmpeg
