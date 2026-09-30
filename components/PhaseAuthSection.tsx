"use client";

import React, { useState } from "react";
import {
  AuthTokensResponse,
  StaxClientConfig,
  UserProfile,
  VerificationType,
  staxFetch,
} from "@/lib/stax-api";

interface PhaseAuthSectionProps {
  clientConfig: StaxClientConfig;
  user: UserProfile | null;
  setUser: (user: UserProfile | null) => void;
  onTokensReceived: (accessToken: string, refreshToken?: string) => void;
  onClearSession: () => void;
  notify: (type: "success" | "error" | "info", message: string) => void;
  onRefreshAllData: () => Promise<void>;
}

export default function PhaseAuthSection({
  clientConfig,
  user,
  setUser,
  onTokensReceived,
  onClearSession,
  notify,
  onRefreshAllData,
}: PhaseAuthSectionProps) {
  // Step 1: Signup state
  const [signupEmail, setSignupEmail] = useState("user@staxmoney.com");
  const [signupNickname, setSignupNickname] = useState("Johnny");
  const [signupPhone, setSignupPhone] = useState("+2348012345678");
  const [loadingSignup, setLoadingSignup] = useState(false);

  // Step 2 & 3: OTP Verify state
  const [verifyTarget, setVerifyTarget] = useState("user@staxmoney.com");
  const [verifyType, setVerifyType] = useState<VerificationType>("EMAIL");
  const [otpCode, setOtpCode] = useState("");
  const [loadingSendOtp, setLoadingSendOtp] = useState(false);
  const [loadingConfirmOtp, setLoadingConfirmOtp] = useState(false);

  // Step 4: Complete Profile state
  const [firstName, setFirstName] = useState(user?.firstName || "John");
  const [lastName, setLastName] = useState(user?.lastName || "Doe");
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingMe, setLoadingMe] = useState(false);

  // Step 5: Passwordless Login state
  const [loginEmail, setLoginEmail] = useState("user@staxmoney.com");
  const [loadingLogin, setLoadingLogin] = useState(false);

  // Step 6: Refresh Token & Manual Token state
  const [loadingRefresh, setLoadingRefresh] = useState(false);
  const [manualAccessToken, setManualAccessToken] = useState("");
  const [manualRefreshToken, setManualRefreshToken] = useState("");
  const [showTokenEditor, setShowTokenEditor] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!signupEmail.trim() || !signupNickname.trim()) {
      notify("error", "Email and nickname are required for signup.");
      return;
    }
    setLoadingSignup(true);
    try {
      const payload: Record<string, string> = {
        email: signupEmail.trim(),
        nickname: signupNickname.trim(),
      };
      if (signupPhone.trim()) {
        payload.phoneNumber = signupPhone.trim();
      }
      await staxFetch(clientConfig, "POST", "/auth/signup", payload, {
        skipAuth: true,
      });
      setVerifyTarget(signupEmail.trim());
      setVerifyType("EMAIL");
      setLoginEmail(signupEmail.trim());
      notify(
        "success",
        `Registered ${signupEmail.trim()}! Check backend terminal console for [DEV OTP DISPATCH] 6-digit code.`,
      );
    } catch (err: unknown) {
      notify(
        "error",
        err instanceof Error ? err.message : "Signup request failed",
      );
    } finally {
      setLoadingSignup(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!loginEmail.trim()) {
      notify("error", "Please enter your registered email address.");
      return;
    }
    setLoadingLogin(true);
    try {
      await staxFetch(
        clientConfig,
        "POST",
        "/auth/login",
        { email: loginEmail.trim() },
        { skipAuth: true },
      );
      setVerifyTarget(loginEmail.trim());
      setVerifyType("EMAIL");
      notify(
        "success",
        `Login OTP dispatched to ${loginEmail.trim()}! Enter the 6-digit OTP in Step 2 to receive tokens.`,
      );
    } catch (err: unknown) {
      notify("error", err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoadingLogin(false);
    }
  }

  async function handleSendOtp() {
    if (!verifyTarget.trim()) {
      notify("error", "Enter a target email or phone number first.");
      return;
    }
    setLoadingSendOtp(true);
    try {
      await staxFetch(
        clientConfig,
        "POST",
        "/auth/verify/send",
        {
          target: verifyTarget.trim(),
          type: verifyType,
        },
        { skipAuth: true },
      );
      notify(
        "success",
        `OTP sent to ${verifyTarget.trim()} (${verifyType}). Check backend console for [DEV OTP DISPATCH].`,
      );
    } catch (err: unknown) {
      notify(
        "error",
        err instanceof Error ? err.message : "Failed to send OTP",
      );
    } finally {
      setLoadingSendOtp(false);
    }
  }

  async function handleConfirmOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!verifyTarget.trim() || !otpCode.trim()) {
      notify("error", "Target and 6-digit OTP code are required.");
      return;
    }
    setLoadingConfirmOtp(true);
    try {
      const res = await staxFetch<AuthTokensResponse>(
        clientConfig,
        "POST",
        "/auth/verify/confirm",
        {
          target: verifyTarget.trim(),
          code: otpCode.trim(),
          type: verifyType,
        },
        { skipAuth: true },
      );

      const access =
        res?.accessToken ||
        (res?.data as Record<string, string> | undefined)?.accessToken;
      const refresh =
        res?.refreshToken ||
        (res?.data as Record<string, string> | undefined)?.refreshToken;

      if (access) {
        onTokensReceived(access, refresh);
        notify(
          "success",
          `${verifyType} OTP verified! Session JWT tokens saved.`,
        );
        setOtpCode("");
        if (res?.user) {
          setUser(res.user);
        }
      } else {
        notify(
          "info",
          "OTP confirmed, but no accessToken field was found in response. Inspect API log.",
        );
      }
    } catch (err: unknown) {
      notify(
        "error",
        err instanceof Error ? err.message : "OTP verification failed",
      );
    } finally {
      setLoadingConfirmOtp(false);
    }
  }

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      notify("error", "Both firstName and lastName are required.");
      return;
    }
    setLoadingProfile(true);
    try {
      const res = await staxFetch<UserProfile>(
        clientConfig,
        "PATCH",
        "/users/profile",
        {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        },
      );
      if (res && typeof res === "object") {
        setUser({
          ...(user || { email: signupEmail }),
          ...res,
          firstName: res.firstName ?? firstName.trim(),
          lastName: res.lastName ?? lastName.trim(),
        });
      }
      notify(
        "success",
        "Profile updated! Account status transitions from PENDING to ACTIVE once email & legal names are set.",
      );
      await handleFetchMe(true);
    } catch (err: unknown) {
      notify(
        "error",
        err instanceof Error ? err.message : "Profile update failed",
      );
    } finally {
      setLoadingProfile(false);
    }
  }

  async function handleFetchMe(silent = false) {
    setLoadingMe(true);
    try {
      const res = await staxFetch<UserProfile>(
        clientConfig,
        "GET",
        "/users/me",
      );
      if (res && typeof res === "object") {
        const unwrapped =
          (res as { user?: UserProfile }).user ||
          (res as { data?: UserProfile }).data ||
          res;
        setUser(unwrapped);
        if (unwrapped.firstName) setFirstName(String(unwrapped.firstName));
        if (unwrapped.lastName) setLastName(String(unwrapped.lastName));
      }
      if (!silent) {
        notify("success", "Fetched current user profile from GET /v1/users/me");
      }
    } catch (err: unknown) {
      if (!silent) {
        notify(
          "error",
          err instanceof Error ? err.message : "Could not fetch /users/me",
        );
      }
    } finally {
      setLoadingMe(false);
    }
  }

  async function handleRotateRefreshToken() {
    if (!clientConfig.refreshToken) {
      notify("error", "No refreshToken stored in current session.");
      return;
    }
    setLoadingRefresh(true);
    try {
      const res = await staxFetch<AuthTokensResponse>(
        clientConfig,
        "POST",
        "/auth/refresh",
        { refreshToken: clientConfig.refreshToken },
        { skipAuth: true },
      );
      const access =
        res?.accessToken ||
        (res?.data as Record<string, string> | undefined)?.accessToken;
      const refresh =
        res?.refreshToken ||
        (res?.data as Record<string, string> | undefined)?.refreshToken;
      if (access) {
        onTokensReceived(access, refresh);
        notify(
          "success",
          "Refresh token rotated! Old refresh token invalidated and new JWT pair stored.",
        );
      } else {
        notify("info", "Refresh response received; check API console.");
      }
    } catch (err: unknown) {
      notify(
        "error",
        err instanceof Error ? err.message : "Refresh token rotation failed",
      );
    } finally {
      setLoadingRefresh(false);
    }
  }

  function handleSaveManualTokens(e: React.FormEvent) {
    e.preventDefault();
    if (!manualAccessToken.trim()) {
      notify("error", "Please enter an accessToken.");
      return;
    }
    onTokensReceived(
      manualAccessToken.trim(),
      manualRefreshToken.trim() || undefined,
    );
    setManualAccessToken("");
    setManualRefreshToken("");
    setShowTokenEditor(false);
    notify("success", "Bearer token saved manually!");
  }

  return (
    <div className="space-y-6">
      {/* Phase Header Banner */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
              Phase 1 • Passwordless Auth & Progressive Onboarding
            </span>
            <h2 className="mt-2 text-xl font-bold text-white">
              Identity Registration, OTP Verification & Session Management
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Sign up with nickname & email, confirm 6-digit OTPs (logged under{" "}
              <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-emerald-300 font-mono">
                [DEV OTP DISPATCH]
              </code>{" "}
              in your backend terminal), and complete legal names to activate
              your account.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {clientConfig.accessToken && (
              <button
                type="button"
                onClick={() => onRefreshAllData()}
                className="rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 transition"
              >
                Sync All User State
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowTokenEditor((v) => !v)}
              className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-2 text-xs font-medium text-indigo-300 hover:bg-indigo-500/20 transition"
            >
              {showTokenEditor ? "Hide Token Input" : "Paste Bearer Token"}
            </button>
          </div>
        </div>

        {showTokenEditor && (
          <form
            onSubmit={handleSaveManualTokens}
            className="mt-4 grid gap-3 rounded-xl border border-indigo-500/20 bg-slate-950/80 p-4 sm:grid-cols-3"
          >
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Access Token (JWT)
              </label>
              <input
                type="text"
                value={manualAccessToken}
                onChange={(e) => setManualAccessToken(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIs..."
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Refresh Token (Optional)
              </label>
              <input
                type="text"
                value={manualRefreshToken}
                onChange={(e) => setManualRefreshToken(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIs..."
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition"
              >
                Save Session Tokens
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Main Grid: Step 1 Signup / Step 5 Login + Step 2/3 OTP Verification */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Column: Step 1 Signup & Step 5 Passwordless Login */}
        <div className="space-y-6">
          {/* Step 1: Register */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  Step 1 • New User
                </span>
                <h3 className="text-base font-bold text-white">
                  Register Account
                </h3>
              </div>
              <code className="rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-300 font-mono">
                POST /v1/auth/signup
              </code>
            </div>

            <form onSubmit={handleSignup} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Email Address <span className="text-rose-400">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  placeholder="user@staxmoney.com"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Nickname <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={signupNickname}
                    onChange={(e) => setSignupNickname(e.target.value)}
                    placeholder="Johnny"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Phone Number{" "}
                    <span className="text-slate-500">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={signupPhone}
                    onChange={(e) => setSignupPhone(e.target.value)}
                    placeholder="+2348012345678"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loadingSignup}
                className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 disabled:opacity-50 transition"
              >
                {loadingSignup
                  ? "Creating Pending User & Sending OTP..."
                  : "Sign Up & Dispatch Email OTP"}
              </button>
            </form>
          </div>

          {/* Step 5: Passwordless Login */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-sky-400">
                  Step 5 • Returning User
                </span>
                <h3 className="text-base font-bold text-white">
                  Passwordless Login
                </h3>
              </div>
              <code className="rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-300 font-mono">
                POST /v1/auth/login
              </code>
            </div>

            <form
              onSubmit={handleLogin}
              className="flex flex-col sm:flex-row gap-3"
            >
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="user@staxmoney.com"
                className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={loadingLogin}
                className="rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50 transition whitespace-nowrap"
              >
                {loadingLogin ? "Sending OTP..." : "Send Login OTP"}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Step 2 & 3 Verify Email / Phone OTP */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                  Steps 2 & 3 • Verification
                </span>
                <h3 className="text-base font-bold text-white">
                  Verify Email or Phone OTP
                </h3>
              </div>
              <code className="rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-300 font-mono">
                POST /v1/auth/verify/confirm
              </code>
            </div>

            {/* Channel Selector */}
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-950 p-1 border border-slate-800 mb-4">
              <button
                type="button"
                onClick={() => {
                  setVerifyType("EMAIL");
                  setVerifyTarget(signupEmail || loginEmail);
                }}
                className={`rounded-lg py-2 text-xs font-semibold transition ${
                  verifyType === "EMAIL"
                    ? "bg-amber-500 text-slate-950 shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                EMAIL Verification
              </button>
              <button
                type="button"
                onClick={() => {
                  setVerifyType("PHONE");
                  if (signupPhone) setVerifyTarget(signupPhone);
                }}
                className={`rounded-lg py-2 text-xs font-semibold transition ${
                  verifyType === "PHONE"
                    ? "bg-amber-500 text-slate-950 shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                PHONE Verification (Optional)
              </button>
            </div>

            <form onSubmit={handleConfirmOtp} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-300">
                    Target (
                    {verifyType === "EMAIL" ? "Email Address" : "Phone Number"})
                  </label>
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={loadingSendOtp}
                    className="text-xs font-medium text-amber-400 hover:text-amber-300 underline disabled:opacity-50"
                  >
                    {loadingSendOtp
                      ? "Dispatching..."
                      : `Request / Resend ${verifyType} OTP (/verify/send)`}
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={verifyTarget}
                  onChange={(e) => setVerifyTarget(e.target.value)}
                  placeholder={
                    verifyType === "EMAIL"
                      ? "user@staxmoney.com"
                      : "+2348012345678"
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  6-Digit OTP Code (from{" "}
                  <code className="text-amber-300 font-mono">
                    [DEV OTP DISPATCH]
                  </code>{" "}
                  in backend logs)
                </label>
                <input
                  type="text"
                  required
                  maxLength={8}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="123456"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-center font-mono text-lg tracking-[0.35em] text-amber-300 placeholder-slate-600 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loadingConfirmOtp}
                className="w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50 transition"
              >
                {loadingConfirmOtp
                  ? "Verifying OTP..."
                  : `Confirm ${verifyType} OTP & Issue JWT Tokens`}
              </button>
            </form>
          </div>

          <div className="mt-4 rounded-xl border border-slate-800/80 bg-slate-950/60 p-3 text-xs text-slate-400">
            <span className="font-semibold text-slate-300">Note:</span>{" "}
            Confirming either Email or Phone OTP returns a new JWT{" "}
            <code className="text-emerald-300 font-mono">accessToken</code> and{" "}
            <code className="text-emerald-300 font-mono">refreshToken</code>{" "}
            pair which is automatically attached to all subsequent API requests.
          </div>
        </div>
      </div>

      {/* Bottom Grid: Step 4 Complete Profile & Step 6 Refresh Token Rotation */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Step 4: Complete Profile */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-purple-400">
                Step 4 • Progressive Activation
              </span>
              <h3 className="text-base font-bold text-white">
                Complete Legal Profile
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <code className="rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-300 font-mono">
                PATCH /v1/users/profile
              </code>
            </div>
          </div>

          <p className="text-xs text-slate-400 mb-4">
            Once email is verified and legal first/last names are provided,{" "}
            <code className="text-purple-300 font-mono">accountStatus</code>{" "}
            automatically transitions from{" "}
            <span className="text-amber-400 font-semibold">PENDING</span> to{" "}
            <span className="text-emerald-400 font-semibold">ACTIVE</span>.
          </p>

          <form onSubmit={handleUpdateProfile} className="space-y-3.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  First Name
                </label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="John"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-purple-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Last Name
                </label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-purple-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={loadingProfile}
                className="flex-1 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-50 transition"
              >
                {loadingProfile
                  ? "Updating Profile..."
                  : "Update Legal Names (Activate Account)"}
              </button>
              <button
                type="button"
                onClick={() => handleFetchMe(false)}
                disabled={loadingMe}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50 transition"
              >
                {loadingMe ? "Checking..." : "GET /v1/users/me"}
              </button>
            </div>
          </form>

          {user && (
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/80 p-3.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-400">
                  Current User Profile State
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    user.accountStatus === "ACTIVE"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  }`}
                >
                  {String(user.accountStatus || "PENDING")}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500">Email:</span>{" "}
                  <span className="text-slate-200 font-mono">{user.email}</span>
                </div>
                <div>
                  <span className="text-slate-500">Nickname:</span>{" "}
                  <span className="text-slate-200">{user.nickname || "—"}</span>
                </div>
                <div>
                  <span className="text-slate-500">Legal Name:</span>{" "}
                  <span className="text-slate-200">
                    {[user.firstName, user.lastName]
                      .filter(Boolean)
                      .join(" ") || "Not set"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Phone:</span>{" "}
                  <span className="text-slate-200 font-mono">
                    {user.phoneNumber || "—"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Step 6: Refresh Token Rotation & Session Status */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                  Step 6 • Security & Session
                </span>
                <h3 className="text-base font-bold text-white">
                  JWT Session & Refresh Token Rotation
                </h3>
              </div>
              <code className="rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-300 font-mono">
                POST /v1/auth/refresh
              </code>
            </div>

            <p className="text-xs text-slate-400 mb-4">
              Rotates your session by invalidating the old refresh token and
              issuing a fresh token pair. Reusing a revoked refresh token
              triggers emergency revocation of all active sessions.
            </p>

            <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950 p-3.5 text-xs">
              <div>
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span>Active Access Token (Bearer):</span>
                  <span
                    className={
                      clientConfig.accessToken
                        ? "text-emerald-400 font-semibold"
                        : "text-rose-400"
                    }
                  >
                    {clientConfig.accessToken ? "Authenticated" : "None"}
                  </span>
                </div>
                <div className="truncate rounded bg-slate-900 px-2.5 py-1.5 font-mono text-[11px] text-slate-300 border border-slate-800">
                  {clientConfig.accessToken ||
                    "No access token yet — verify OTP or paste token"}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span>Refresh Token:</span>
                  <span className="text-slate-500">
                    {clientConfig.refreshToken ? "Available" : "None"}
                  </span>
                </div>
                <div className="truncate rounded bg-slate-900 px-2.5 py-1.5 font-mono text-[11px] text-slate-300 border border-slate-800">
                  {clientConfig.refreshToken || "No refresh token stored"}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleRotateRefreshToken}
              disabled={loadingRefresh || !clientConfig.refreshToken}
              className="flex-1 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 transition"
            >
              {loadingRefresh
                ? "Rotating Token Pair..."
                : "Rotate Refresh Token (/auth/refresh)"}
            </button>
            {clientConfig.accessToken && (
              <button
                type="button"
                onClick={onClearSession}
                className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition"
              >
                Clear Session
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
