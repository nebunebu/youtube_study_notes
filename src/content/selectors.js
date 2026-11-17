// Everything that depends on YouTube's markup lives here. When YouTube changes
// the Ask panel, this is the file to fix. Verified against the live page on
// 2026-11-17.
(function (root) {
  const YSN = (root.YSN = root.YSN || {});

  YSN.selectors = {
    // The Ask engagement panel. The chat input is the fallback anchor if the id changes.
    panel: 'ytd-engagement-panel-section-list-renderer[target-id="PAyouchat"]',
    panelHost: 'ytd-engagement-panel-section-list-renderer',
    panelHidden: 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN',

    // Ask buttons appear in different places per video and layout: on the player,
    // in the action row under the video, in the description, or in the "..." menu.
    askLabel: /^ask(\s+questions|\s+about this video)?$/i,
    askStructural: '[class*="youchat" i] button, yt-video-description-youchat-section-view-model button',
    overflowButton:
      'ytd-watch-metadata ytd-menu-renderer yt-button-shape#button-shape button, ytd-watch-metadata button[aria-label="More actions"]',
    overflowItem: 'ytd-menu-popup-renderer [role="menuitem"], ytd-menu-popup-renderer tp-yt-paper-item, yt-list-item-view-model',

    input: 'yt-chat-input-view-model textarea, yt-chat-input-view-model [contenteditable="true"]',
    send: 'yt-chat-input-view-model button[type="submit"], yt-chat-input-view-model button[aria-label="Send"]',

    item: 'you-chat-item-view-model', // one per chat turn (greeting, question, reply, chips)
    reply: 'markdown-div', // rendered Gemini reply inside an item
    chips: 'you-chat-chips-data', // suggestion chips; they appear once a reply is finished

    adShowing: '#movie_player.ad-showing, .html5-video-player.ad-showing',
    video: '#movie_player video, video.html5-main-video',
    title: 'ytd-watch-metadata h1, h1.ytd-watch-metadata',
    channel: 'ytd-watch-metadata ytd-channel-name a, #owner ytd-channel-name a',
  };
})(globalThis);
