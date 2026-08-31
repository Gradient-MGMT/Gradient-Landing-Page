(() => {
  const video = document.querySelector(".stage");
  if (!video) return;

  const play = () => {
    const next = video.play();
    if (next) next.catch(() => {});
  };

  const tick = () => {
    if (video.duration && video.currentTime >= video.duration - 0.04) {
      video.currentTime = 0;
    }
    if ("requestVideoFrameCallback" in video) {
      video.requestVideoFrameCallback(tick);
    } else {
      requestAnimationFrame(tick);
    }
  };

  video.addEventListener("ended", () => {
    video.currentTime = 0;
    play();
  });

  if (video.readyState >= 1) tick();
  else video.addEventListener("loadedmetadata", tick, { once: true });
})();
