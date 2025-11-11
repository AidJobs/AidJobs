'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        router.push('/admin');
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.detail || errorData.error || 'Invalid password';
        setError(errorMessage);
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-gray-900">
      {/* Left Side - Login Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-8 lg:px-16 xl:px-24 bg-gray-900 relative">
        {/* Vertical white line on the right */}
        <div className="hidden lg:block absolute right-0 top-0 bottom-0 w-px bg-white/10"></div>
        
        <div className="max-w-md mx-auto w-full">
          {/* AidJobs Logo */}
          <div className="mb-12">
            <h1 className="text-4xl font-thin text-white tracking-tight">
              AidJobs
            </h1>
          </div>

          {/* Login Form */}
          <div>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Password Input */}
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-light text-gray-300 mb-2"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    className="w-full px-4 py-3 text-sm border border-white/20 rounded-lg 
                             bg-gray-800/50 text-white font-light
                             placeholder:text-gray-500
                             focus:outline-none focus:ring-1 focus:ring-white/30 
                             focus:border-white/40
                             disabled:opacity-50 disabled:cursor-not-allowed
                             transition-all duration-200
                             pr-12 backdrop-blur-sm"
                    placeholder="Enter your password"
                    autoFocus
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-white transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-900/30 border border-red-500/30 rounded-lg px-4 py-3">
                  <p className="text-sm text-red-300 flex items-center gap-2 font-light">
                    <svg
                      className="w-4 h-4 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    {error}
                  </p>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || !password}
                className="w-full px-6 py-3 bg-gradient-to-r from-orange-accent to-orange-dark text-white font-light rounded-lg text-sm
                         hover:from-orange-dark hover:to-orange-darker
                         focus:outline-none focus:ring-2 focus:ring-orange-accent focus:ring-opacity-50
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all duration-200 
                         shadow-lg hover:shadow-xl"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="animate-spin h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span>Logging in...</span>
                  </span>
                ) : (
                  <span>Login</span>
                )}
              </button>
            </form>
          </div>

          {/* Visit AidJobs Link */}
          <div className="mt-8">
            <Link
              href="https://aidjobs.app"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors font-light"
            >
              <svg
                className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
              <span>Visit aidjobs.app</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Right Side - Tagline */}
      <div className="hidden lg:flex lg:w-1/2 items-center justify-center px-16 xl:px-24 bg-gray-900 relative">
        {/* Gradient overlay for text */}
        <div className="absolute inset-0 bg-gradient-to-br from-peach-light/10 via-peach-lighter/10 to-orange-accent/10"></div>
        
        {/* Large Tagline Text */}
        <div className="relative z-10 text-center">
          <h2 className="text-6xl xl:text-7xl 2xl:text-8xl font-thin leading-tight tracking-tight">
            <span className="bg-gradient-to-r from-peach-light via-peach-lighter to-orange-accent bg-clip-text text-transparent">
              Become a
            </span>
            <br />
            <span className="bg-gradient-to-r from-orange-accent via-orange-dark to-orange-darker bg-clip-text text-transparent">
              Changemaker
            </span>
          </h2>
        </div>

        {/* Decorative white lines */}
        <div className="absolute top-1/4 left-0 w-full h-px bg-white/5"></div>
        <div className="absolute bottom-1/4 left-0 w-full h-px bg-white/5"></div>
      </div>

      {/* Mobile: Show tagline below login */}
      <div className="lg:hidden w-full absolute bottom-8 left-0 right-0 px-8 text-center">
        <p className="text-2xl font-thin text-gray-400">
          <span className="bg-gradient-to-r from-peach-light to-orange-accent bg-clip-text text-transparent">
            Become a Changemaker
          </span>
        </p>
      </div>
    </div>
  );
}