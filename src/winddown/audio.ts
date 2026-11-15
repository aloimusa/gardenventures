import { SOUNDS } from './model';

/** One local recording at a time. Device hardware/software volume is the only volume control. */
export class WinddownAudio {
  private tracks = new Map<string, HTMLAudioElement>();
  private request = 0;
  playing = false;
  sound = 'canton';

  constructor(container: HTMLElement) {
    for (const sound of SOUNDS) {
      const audio = new Audio();
      audio.src = sound.file;
      audio.preload = 'none';
      audio.loop = true; // The app timer, never this element, determines the session length.
      audio.setAttribute('playsinline', '');
      audio.dataset.audioSound = sound.id;
      audio.setAttribute('aria-hidden', 'true');
      container.append(audio);
      this.tracks.set(sound.id, audio);
    }
  }

  async play(id: string): Promise<boolean> {
    const request = ++this.request;
    const next = this.tracks.get(id) || this.tracks.get('canton')!;
    for (const audio of this.tracks.values()) if (audio !== next) audio.pause();
    if (this.sound !== id) next.currentTime = 0;
    this.sound = id;
    try {
      await next.play();
    } catch (error) {
      if (request === this.request) this.playing = false;
      throw error;
    }
    // A newer play/pause owns the elements now. In particular, do not pause a track
    // which an older pending play might share with the newer request.
    if (request !== this.request) return false;
    this.playing = true;
    return true;
  }

  pause(): void {
    this.request++;
    this.playing = false;
    for (const audio of this.tracks.values()) audio.pause();
  }

  stop(): void {
    this.pause();
    for (const audio of this.tracks.values()) audio.currentTime = 0;
  }

  snapshot() {
    return {
      playing: this.playing,
      sound: this.sound,
      tracks: SOUNDS.map(sound => {
        const audio = this.tracks.get(sound.id)!;
        return { id: sound.id, paused: audio.paused, src: audio.src, volume: audio.volume, currentTime: audio.currentTime };
      }),
    };
  }
}
