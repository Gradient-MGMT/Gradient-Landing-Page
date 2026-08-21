(() => {
  const veil = document.querySelector(".page-veil");
  if (!veil) return;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const duration = 420;

  const reveal = () => {
    document.documentElement.classList.remove("is-entering");
    veil.classList.remove("is-on");
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(reveal);
  });

  window.addEventListener("pageshow", (event) => {
    if (event.persisted) reveal();
  });

  if (reduce) return;

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link) return;

    const href = link.getAttribute("href");
    if (!href || href.startsWith("#") || link.target === "_blank" || event.metaKey || event.ctrlKey || event.shiftKey) {
      return;
    }

    let url;
    try {
      url = new URL(link.href, window.location.href);
    } catch {
      return;
    }

    if (url.origin !== window.location.origin) return;
    if (url.pathname === window.location.pathname && url.hash === window.location.hash) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    veil.classList.add("is-on");
    window.setTimeout(() => {
      window.location.href = link.href;
    }, duration);
  });
})();
