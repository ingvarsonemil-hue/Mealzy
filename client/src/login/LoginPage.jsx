import { useState, useRef, useEffect } from "react";

/* ============================================================
   Inline SVG Icons — no external libraries
   ============================================================ */
const Icons = {
  mail: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  ),
  lock: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  eye: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  eyeOff: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  ),
  arrowRight: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  ),
  check: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  logo: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
    </svg>
  ),
  google: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  ),
};

/* ============================================================
   Login Page Component
   ============================================================ */
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");

  const emailRef = useRef(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  const validate = () => {
    const nextErrors = {};
    if (!email.trim()) nextErrors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nextErrors.email = "Please enter a valid email";
    if (!password) nextErrors.password = "Password is required";
    else if (password.length < 8) nextErrors.password = "Password must be at least 8 characters";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!validate()) return;

    setIsLoading(true);
    try {
      // TODO: swap with your auth utility
      // import { login } from "@/lib/auth";
      // await login({ email, password, rememberMe });
      await new Promise((r) => setTimeout(r, 1500)); // simulated
      window.location.href = "/dashboard";
    } catch (err) {
      setFormError(err.message || "Invalid email or password. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-parchment text-stone-800 flex flex-col lg:flex-row">
      {/* =========================================================
          Left Panel — Brand / Illustration (desktop only)
          ========================================================= */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-5/12 bg-forest text-white flex-col justify-between p-12 relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-24 -left-24 w-64 h-64 rounded-full bg-white/5" aria-hidden="true" />
        <div className="absolute top-1/3 -right-16 w-48 h-48 rounded-full bg-white/5" aria-hidden="true" />
        <div className="absolute -bottom-32 left-1/4 w-80 h-80 rounded-full bg-white/5" aria-hidden="true" />

        <div className="relative z-10">
          <a href="/" className="inline-flex items-center gap-3 text-white/90 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded-lg">
            <Icons.logo className="w-8 h-8" />
            <span className="text-2xl font-bold tracking-tight">Mealzy</span>
          </a>
        </div>

        <div className="relative z-10 max-w-md">
          <blockquote className="text-xl xl:text-2xl font-medium leading-relaxed text-white/90">
            "Meal planning used to take me hours every Sunday. With Mealzy, I have my entire week mapped out in under 10 minutes."
          </blockquote>
          <div className="mt-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">
              SK
            </div>
            <div>
              <p className="font-semibold text-white">Sarah K.</p>
              <p className="text-white/60 text-sm">Home cook & meal-prepper</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 text-white/50 text-sm">
          © {new Date().getFullYear()} Mealzy. All rights reserved.
        </div>
      </div>

      {/* =========================================================
          Right Panel — Form
          ========================================================= */}
      <div className="flex-1 flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16 xl:px-24">
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-xl bg-forest text-white flex items-center justify-center">
            <Icons.logo className="w-6 h-6" />
          </div>
          <span className="text-xl font-bold text-stone-900">Mealzy</span>
        </div>

        <div className="w-full max-w-sm mx-auto lg:mx-0">
          <h1 className="text-3xl font-bold text-stone-900 tracking-tight">Welcome back</h1>
          <p className="mt-2 text-stone-500">Sign in to your account to continue planning.</p>

          {/* Form-level error */}
          {formError && (
            <div className="mt-6 p-4 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm" role="alert" aria-live="assertive">
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-stone-700 mb-1.5">
                Email address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                  <Icons.mail />
                </div>
                <input
                  ref={emailRef}
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) setErrors((p) => ({ ...p, email: "" }));
                  }}
                  className={`block w-full pl-11 pr-4 py-3 rounded-xl border bg-white text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-forest/20 focus:border-forest transition-all ${
                    errors.email ? "border-red-300 focus:border-red-400 focus:ring-red-100" : "border-stone-200"
                  }`}
                  placeholder="you@example.com"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "email-error" : undefined}
                />
              </div>
              {errors.email && (
                <p id="email-error" className="mt-1.5 text-sm text-red-600" role="alert">
                  {errors.email}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-stone-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                  <Icons.lock />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors((p) => ({ ...p, password: "" }));
                  }}
                  className={`block w-full pl-11 pr-12 py-3 rounded-xl border bg-white text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-forest/20 focus:border-forest transition-all ${
                    errors.password ? "border-red-300 focus:border-red-400 focus:ring-red-100" : "border-stone-200"
                  }`}
                  placeholder="••••••••"
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? "password-error" : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-stone-400 hover:text-stone-600 focus:outline-none focus-visible:text-forest rounded-lg"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <Icons.eyeOff /> : <Icons.eye />}
                </button>
              </div>
              {errors.password && (
                <p id="password-error" className="mt-1.5 text-sm text-red-600" role="alert">
                  {errors.password}
                </p>
              )}
            </div>

            {/* Remember me + Forgot password */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <div className="relative flex items-center">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className="w-5 h-5 rounded-md border-2 border-stone-300 bg-white peer-checked:bg-forest peer-checked:border-forest transition-all flex items-center justify-center">
                    <Icons.check className="w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
                  </div>
                </div>
                <span className="text-sm text-stone-600 group-hover:text-stone-800 transition-colors">Remember me</span>
              </label>
              <a
                href="/reset-password"
                className="text-sm font-medium text-forest hover:text-forest/80 focus:outline-none focus-visible:underline"
              >
                Forgot password?
              </a>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-forest text-white font-semibold py-3 px-4 rounded-xl hover:bg-forest/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 focus-visible:ring-offset-parchment disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <Icons.arrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="mt-8 relative">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-stone-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-parchment px-4 text-stone-400">or continue with</span>
            </div>
          </div>

          {/* Google button only */}
          <div className="mt-6 grid grid-cols-1 gap-3">
            <button
              type="button"
              className="flex items-center justify-center gap-2.5 w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-stone-700 font-medium text-sm hover:bg-stone-50 hover:border-stone-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 focus-visible:ring-offset-parchment transition-all"
            >
              <Icons.google />
              Google
            </button>
          </div>

          {/* Sign up link */}
          <p className="mt-8 text-center text-sm text-stone-500">
            Don't have an account?{" "}
            <a href="/signup" className="font-semibold text-forest hover:text-forest/80 focus:outline-none focus-visible:underline">
              Sign up for free
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}