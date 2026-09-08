(() => {
  const auth = window.GradientAuth;
  const state = window.GradientPortalState;

  if (!auth || !state) return;

  if (!auth.getSession().authenticated) {
    window.location.replace("portal-login.html");
    return;
  }

  const panelTitles = {
    overview: "Portfolio overview",
    investments: "Investments",
    documents: "Documents",
    account: "Account",
  };

  const panels = [...document.querySelectorAll("[data-panel]")];
  const navigationControls = [...document.querySelectorAll("[data-portal-nav]")];
  const navItems = [...document.querySelectorAll(".portal-nav__item[data-portal-nav]")];
  const headerTitle = document.querySelector("[data-header-title]");
  const main = document.querySelector("#portal-main");
  const profileToggle = document.querySelector("[data-profile-toggle]");
  const profileMenu = document.querySelector("[data-profile-menu]");
  const mobileMenu = document.querySelector("[data-mobile-menu]");
  const mobileScrim = document.querySelector("[data-mobile-scrim]");
  const sidebar = document.querySelector(".portal-sidebar");
  const workspace = document.querySelector(".portal-workspace");
  const toast = document.querySelector(".portal-toast");
  const documentRows = [...document.querySelectorAll("[data-document-row]")];
  const documentFilters = [...document.querySelectorAll("[data-document-filter]")];
  const documentEmpty = document.querySelector("[data-document-empty]");
  const documentPreview = document.querySelector("[data-document-preview]");
  const documentPreviewTitle = document.querySelector("[data-document-preview-title]");
  const documentPageTitle = document.querySelector("[data-document-page-title]");
  const documentPreviewMeta = document.querySelector("[data-document-preview-meta]");
  const mobileLayout = window.matchMedia("(max-width: 820px)");
  let toastTimer;
  let documentTrigger;

  function syncSidebarAccessibility() {
    if (!sidebar || !workspace) return;
    const drawerState = {
      isMobile: mobileLayout.matches,
      isOpen: sidebar.classList.contains("is-open"),
    };
    sidebar.inert = state.shouldDisableSidebar(drawerState);
    workspace.inert = state.shouldDisableWorkspace(drawerState);
  }

  function getSidebarFocusableControls() {
    if (!sidebar) return [];
    return [...sidebar.querySelectorAll("a[href], button:not([disabled])")]
      .filter((control) => control.getClientRects().length > 0);
  }

  function closeProfileMenu({ restoreFocus = false } = {}) {
    if (!profileMenu || !profileToggle) return;
    profileMenu.hidden = true;
    profileToggle.setAttribute("aria-expanded", "false");
    if (restoreFocus) profileToggle.focus();
  }

  function closeMobileMenu({ restoreFocus = false } = {}) {
    if (!sidebar || !mobileMenu || !mobileScrim) return;
    sidebar.classList.remove("is-open");
    mobileMenu.setAttribute("aria-expanded", "false");
    mobileMenu.setAttribute("aria-label", "Open navigation");
    mobileScrim.hidden = true;
    document.body.classList.remove("portal-menu-open");
    syncSidebarAccessibility();
    if (restoreFocus) mobileMenu.focus();
  }

  function showToast(message) {
    if (!toast) return;
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 4200);
  }

  function showPanel(requestedPanel, { moveFocus = true } = {}) {
    const panelName = state.normalizePanel(requestedPanel);

    panels.forEach((panel) => {
      panel.hidden = panel.dataset.panel !== panelName;
    });

    navItems.forEach((item) => {
      if (item.dataset.portalNav === panelName) {
        item.setAttribute("aria-current", "page");
      } else {
        item.removeAttribute("aria-current");
      }
    });

    if (headerTitle) headerTitle.textContent = panelTitles[panelName];
    document.title = `${panelTitles[panelName]} — Gradient MGMT`;
    window.history.replaceState(null, "", `#${panelName}`);
    closeProfileMenu();
    closeMobileMenu();
    if (moveFocus && main) main.focus({ preventScroll: true });
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }

  function setDocumentFilter(filter) {
    const records = documentRows.map((row) => ({
      id: row.dataset.documentId,
      type: row.dataset.documentType,
      row,
    }));
    const visibleRecords = state.filterDocuments(filter, records);
    const visibleIds = new Set(visibleRecords.map((record) => record.id));

    documentRows.forEach((row) => {
      row.hidden = !visibleIds.has(row.dataset.documentId);
    });

    documentFilters.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.documentFilter === filter));
    });

    if (documentEmpty) documentEmpty.hidden = visibleRecords.length > 0;
  }

  navigationControls.forEach((item) => {
    item.addEventListener("click", () => showPanel(item.dataset.portalNav));
  });

  documentFilters.forEach((button) => {
    button.addEventListener("click", () => setDocumentFilter(button.dataset.documentFilter));
  });

  document.querySelector("[data-document-reset]")?.addEventListener("click", () => {
    setDocumentFilter("all");
    documentFilters[0]?.focus();
  });

  document.querySelectorAll("[data-document-action]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!documentPreview?.showModal) {
        showToast(`${button.dataset.documentAction} preview is unavailable.`);
        return;
      }
      const row = button.closest("[data-document-row]");
      const title = button.dataset.documentAction;
      documentTrigger = button;
      if (documentPreviewTitle) documentPreviewTitle.textContent = title;
      if (documentPageTitle) documentPageTitle.textContent = title;
      if (documentPreviewMeta) documentPreviewMeta.textContent = row?.querySelector("p")?.textContent || "Investor document";
      documentPreview.showModal();
    });
  });

  document.querySelectorAll("[data-document-preview-close]").forEach((button) => {
    button.addEventListener("click", () => documentPreview?.close());
  });

  documentPreview?.addEventListener("click", (event) => {
    if (event.target === documentPreview) documentPreview.close();
  });

  documentPreview?.addEventListener("close", () => {
    documentTrigger?.focus();
    documentTrigger = null;
  });

  document.querySelectorAll("[data-sign-out]").forEach((button) => {
    button.addEventListener("click", () => {
      auth.signOut();
      window.location.replace("portal-login.html");
    });
  });

  document.querySelector("[data-mfa-info]")?.addEventListener("click", () => {
    showToast("MFA setup will begin after identity verification.");
  });

  document.querySelector("[data-profile-edit]")?.addEventListener("click", () => {
    showToast("Your profile update request has been sent to Investor Relations.");
  });

  document.querySelector("[data-save-preferences]")?.addEventListener("click", () => {
    showToast("Communication preferences saved.");
  });

  profileToggle?.addEventListener("click", () => {
    const willOpen = profileMenu.hidden;
    profileMenu.hidden = !willOpen;
    profileToggle.setAttribute("aria-expanded", String(willOpen));
  });

  mobileMenu?.addEventListener("click", () => {
    const willOpen = !sidebar.classList.contains("is-open");
    if (willOpen) closeProfileMenu();
    sidebar.classList.toggle("is-open", willOpen);
    mobileMenu.setAttribute("aria-expanded", String(willOpen));
    mobileMenu.setAttribute("aria-label", willOpen ? "Close navigation" : "Open navigation");
    mobileScrim.hidden = !willOpen;
    document.body.classList.toggle("portal-menu-open", willOpen);
    syncSidebarAccessibility();
    if (willOpen) getSidebarFocusableControls()[0]?.focus();
  });

  mobileScrim?.addEventListener("click", () => closeMobileMenu({ restoreFocus: true }));

  document.addEventListener("click", (event) => {
    if (!profileMenu || profileMenu.hidden) return;
    if (!profileMenu.contains(event.target) && !profileToggle.contains(event.target)) {
      closeProfileMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Tab" && mobileLayout.matches && sidebar?.classList.contains("is-open")) {
      const controls = getSidebarFocusableControls();
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
      return;
    }
    if (event.key !== "Escape") return;
    if (profileMenu && !profileMenu.hidden) closeProfileMenu({ restoreFocus: true });
    if (sidebar?.classList.contains("is-open")) closeMobileMenu({ restoreFocus: true });
  });

  mobileLayout.addEventListener("change", () => {
    closeMobileMenu();
    syncSidebarAccessibility();
  });

  const initialPanel = window.location.hash.slice(1);
  syncSidebarAccessibility();
  showPanel(initialPanel, { moveFocus: false });
  setDocumentFilter("all");
})();
