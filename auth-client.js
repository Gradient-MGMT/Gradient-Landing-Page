(() => {
  const SESSION_KEY = "gradient_portal_demo_session";
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  window.sessionStorage.removeItem(SESSION_KEY);

  const wait = (duration) => new Promise((resolve) => {
    setTimeout(resolve, duration);
  });

  async function signIn({ email = "", password = "" } = {}) {
    const fields = {};

    if (!emailPattern.test(email.trim())) {
      fields.email = "Enter a valid email address.";
    }

    if (!password) {
      fields.password = "Enter your password.";
    }

    if (Object.keys(fields).length) {
      return {
        status: "error",
        message: "Review the highlighted fields.",
        fields,
      };
    }

    await wait(350);
    return {
      status: "error",
      message: "We couldn't sign you in. Check your credentials and try again.",
      fields: {},
    };
  }

  async function verifyChallenge({ challengeId = "", code = "" } = {}) {
    if (!challengeId || !/^\d{6}$/.test(code)) {
      return {
        status: "error",
        message: "Enter the six-digit verification code.",
        fields: { code: "Enter six digits." },
      };
    }

    await wait(250);
    return {
      status: "error",
      message: "We couldn't verify that code. Please try again.",
      fields: { code: "The verification code was not recognized." },
    };
  }

  function getSession() {
    return {
      authenticated: window.sessionStorage.getItem(SESSION_KEY) === "active",
    };
  }

  function signOut() {
    window.sessionStorage.removeItem(SESSION_KEY);
  }

  window.GradientAuth = Object.freeze({
    signIn,
    verifyChallenge,
    getSession,
    signOut,
  });
})();
