(() => {
  const KEY = "gradient-theme";
  const root = document.documentElement;
  const buttons = [...document.querySelectorAll("[data-theme-set]")];
  if (!buttons.length) return;

  const apply = (theme) => {
    if (theme === "light") root.setAttribute("data-theme", "light");
    else root.removeAttribute("data-theme");
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* ignore */
    }
    buttons.forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.getAttribute("data-theme-set") === theme));
    });
  };

  let theme = "dark";
  try {
    if (localStorage.getItem(KEY) === "light") theme = "light";
  } catch {
    /* ignore */
  }
  apply(theme);

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => apply(btn.getAttribute("data-theme-set")));
  });
})();
