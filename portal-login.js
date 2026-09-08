(() => {
  const auth = window.GradientAuth;
  const flow = window.GradientAuthFlow;
  const loginForm = document.querySelector("#login-form");
  const mfaForm = document.querySelector("#mfa-form");
  const status = document.querySelector("#auth-status");

  if (!auth || !flow || !loginForm || !mfaForm || !status) return;

  if (auth.getSession().authenticated) {
    window.location.replace("portal.html");
    return;
  }

  const emailInput = loginForm.elements.email;
  const passwordInput = loginForm.elements.password;
  const submitButton = loginForm.querySelector("button[type='submit']");
  const submitLabel = loginForm.querySelector("[data-submit-label]");
  const passwordToggle = loginForm.querySelector("[data-toggle-password]");
  const forgotPassword = loginForm.querySelector("[data-forgot-password]");
  const codeInput = mfaForm.elements.code;
  const mfaBack = mfaForm.querySelector("[data-mfa-back]");
  const mfaSubmitButton = mfaForm.querySelector("button[type='submit']");
  let challengeId = "";

  function setStatus(message = "", tone = "neutral") {
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function setFieldError(name, message = "") {
    const input = name === "code" ? codeInput : loginForm.elements[name];
    const error = document.querySelector(`#${name}-error`);
    if (!input || !error) return;

    error.textContent = message;
    if (message) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }

  function clearLoginErrors() {
    setFieldError("email");
    setFieldError("password");
    setStatus();
  }

  function setBusy(isBusy) {
    submitButton.disabled = isBusy;
    submitButton.setAttribute("aria-busy", String(isBusy));
    submitLabel.textContent = isBusy ? "Signing in" : "Sign in";
  }

  function showMfa(nextChallengeId) {
    challengeId = nextChallengeId;
    loginForm.hidden = true;
    mfaForm.hidden = false;
    setStatus();
    codeInput.focus();
  }

  function showLogin() {
    challengeId = "";
    codeInput.value = "";
    setFieldError("code");
    mfaForm.hidden = true;
    loginForm.hidden = false;
    setStatus();
    emailInput.focus();
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearLoginErrors();
    setBusy(true);

    const result = await flow.settle(
      () => auth.signIn({
        email: emailInput.value,
        password: passwordInput.value,
      }),
      () => {
        passwordInput.value = "";
        setBusy(false);
      },
    );

    if (result.status === "unexpected_error") {
      setStatus("We couldn't sign you in. Please try again or contact Gradient Investor Relations.", "error");
      emailInput.focus();
      return;
    }

    if (result.status === "error") {
      Object.entries(result.fields || {}).forEach(([name, message]) => {
        setFieldError(name, message);
      });
      setStatus(result.message, "error");
      const firstInvalid = loginForm.querySelector("[aria-invalid='true']");
      if (firstInvalid) firstInvalid.focus();
      else emailInput.focus();
      return;
    }

    if (result.status === "mfa_required") {
      showMfa(result.challengeId);
      return;
    }

    window.location.assign("portal.html");
  });

  mfaForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setFieldError("code");
    setStatus("Verifying your code…");
    mfaSubmitButton.disabled = true;
    mfaSubmitButton.setAttribute("aria-busy", "true");

    const result = await flow.settle(
      () => auth.verifyChallenge({
        challengeId,
        code: codeInput.value.trim(),
      }),
      () => {
        codeInput.value = "";
        mfaSubmitButton.disabled = false;
        mfaSubmitButton.setAttribute("aria-busy", "false");
      },
    );

    if (result.status === "unexpected_error") {
      setStatus("We couldn't verify that code. Please try again or contact Gradient Investor Relations.", "error");
      codeInput.focus();
      return;
    }

    if (result.status === "error") {
      setFieldError("code", result.fields?.code || result.message);
      setStatus(result.message, "error");
      codeInput.focus();
      return;
    }

    window.location.assign("portal.html");
  });

  passwordToggle.addEventListener("click", () => {
    const isVisible = passwordInput.type === "text";
    passwordInput.type = isVisible ? "password" : "text";
    passwordToggle.textContent = isVisible ? "Show" : "Hide";
    passwordToggle.setAttribute("aria-label", isVisible ? "Show password" : "Hide password");
    passwordInput.focus();
  });

  forgotPassword.addEventListener("click", () => {
    setStatus("For password assistance, contact Gradient Investor Relations at info@gradientmgmt.com.", "info");
  });

  mfaBack.addEventListener("click", showLogin);
})();
