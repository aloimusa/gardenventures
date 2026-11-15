# Wind down audio sources

Retrieved and generated on 2026-11-14. Playback in Garden uses only these local files; it never streams from the source sites.

## White Noise and Heartbeat

- **File:** `canton-white-noise-and-heartbeat.mp3`
- **Title / attribution:** “White Noise and Heartbeat” by **canton**
- **Original page:** https://soundcloud.com/canton/white-noise-and-heartbeat
- **Abitti page:** https://cheat.abitti.fi/build/index.html?lang=fi&tab=muzak (Taustaäänet)
- **Abitti source fragment:** https://cheat.abitti.fi/build/tab-muzak.html
- **Public MP3 actually downloaded:** https://s3.eu-north-1.amazonaws.com/abitti-prod.abitti-prod-cdk.maptiles.abitti.fi/muzak/canton_white_noise_and_heartbeat.mp3
- **Technical details:** complete 34:52.852 MP3, 44.1 kHz stereo, 14,813,276 bytes. The downloaded file is included unchanged; it is not a generated substitute.
- **License evidence:** the inspected SoundCloud page's `<noscript>` track footer states `License: cc-by`. It does not state a license version there, so Garden labels it **CC BY (version not specified)** rather than guessing one. SoundCloud also identifies the artist as canton. Attribution is preserved in the Wind down “Sound sources” disclosure.
- **SHA-256:** `c81537a38ffe59a3bc34e7b68e7694c1793795e90dc4067d6222417895b168ba`

The connection to the Finnish matriculation examination is supported directly by its inclusion under **Taustaäänet** on Abitti's music page.

## Synthesized placeholders

The following original, deterministic preview files were synthesized locally with FFmpeg's `anoisesrc` and simple filters. They contain no third-party recordings or samples. They are intentionally labeled as synthesized previews/placeholders in the interface, not presented as nature field recordings.

| File | Recipe | Duration | SHA-256 |
| --- | --- | ---: | --- |
| `soft-static-generated.mp3` | pink noise, seed 1847, high-pass 100 Hz, low-pass 4.2 kHz, short edge fades | 16 s | `90a1f00948d8aaa3e77b0e0c9078ac21759de17709d362538cf1691d470d25f5` |
| `rain-generated.mp3` | white noise, seed 2951, high-pass 450 Hz, low-pass 7 kHz, gentle tremolo and edge fades | 16 s | `ca010e10335791fe10454406828c5c9aa6f4899ae347ec2482a1c7daf7980605` |
| `stream-generated.mp3` | brown noise, seed 3919, high-pass 70 Hz, low-pass 1.8 kHz, slow tremolo and edge fades | 16 s | `d476924e29572174767c57ef838d7491a9b483528e15c7ca9ac275324802f278` |

Each generated file is mono, 22,050 Hz source audio encoded as MP3 at 48 kbit/s, 96,618 bytes. These are lightweight functional previews, not claims of seamless or production-quality nature loops.
