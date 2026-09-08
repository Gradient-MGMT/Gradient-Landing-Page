(() => {
  const panels = new Set(["overview", "investments", "documents", "account"]);

  function normalizePanel(name) {
    return panels.has(name) ? name : "overview";
  }

  function filterDocuments(filter, documents) {
    return filter === "all"
      ? [...documents]
      : documents.filter((document) => document.type === filter);
  }

  window.GradientPortalState = Object.freeze({
    normalizePanel,
    filterDocuments,
  });
})();
