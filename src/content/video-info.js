// Reads the current video's details from the watch page.
(function (root) {
  const YSN = (root.YSN = root.YSN || {});
  const S = YSN.selectors;

  const videoId = () => (location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') : null);

  // Call only when no ad is showing: during an ad, video.duration is the ad's.
  function read() {
    const id = videoId();
    const video = document.querySelector(S.video);
    const titleEl = document.querySelector(S.title);
    const channelEl = document.querySelector(S.channel);
    const duration = video && Number.isFinite(video.duration) ? video.duration : 0;
    return {
      videoId: id,
      url: `https://www.youtube.com/watch?v=${id}`,
      title: ((titleEl && titleEl.textContent) || document.title.replace(/\s*-\s*YouTube$/, '')).trim(),
      channel: ((channelEl && channelEl.textContent) || '').trim(),
      durationSec: duration,
    };
  }

  YSN.videoInfo = { videoId, read };
})(globalThis);
