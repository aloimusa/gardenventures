// Small progressive enhancement over the native video controls. Without JS, they keep working.
const video = document.querySelector('video');
if (video instanceof HTMLVideoElement) {
  video.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const seekTo = time => {
      event.preventDefault();
      video.currentTime = Math.max(0, Math.min(duration, time));
    };
    switch (event.key) {
      case ' ':
        break; // Native video handles Space on key release; handling it here would toggle twice.
      case 'k':
      case 'K':
        event.preventDefault();
        if (event.repeat) break;
        if (video.paused || video.ended) void video.play().catch(() => {});
        else video.pause();
        break;
      case 'ArrowLeft': seekTo(video.currentTime - 5); break;
      case 'ArrowRight': seekTo(video.currentTime + 5); break;
      case 'Home': seekTo(0); break;
      case 'End': seekTo(duration); break;
    }
  });
}
