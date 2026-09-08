(() => {
  async function settle(request, cleanup = () => {}) {
    try {
      return await request();
    } catch {
      return { status: "unexpected_error" };
    } finally {
      cleanup();
    }
  }

  window.GradientAuthFlow = Object.freeze({ settle });
})();
