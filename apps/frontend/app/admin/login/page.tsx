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
    <div className="h-screen flex overflow-hidden bg-white">
      {/* Left Side - Login Form (35%) */}
      <div className="w-full lg:w-[35%] flex flex-col justify-between px-8 lg:px-12 xl:px-16 bg-white relative py-8">
        {/* Vertical line separator */}
        <div className="hidden lg:block absolute right-0 top-0 bottom-0 w-px bg-[#aaaaaa] opacity-25"></div>
        
        <div className="max-w-sm mx-auto w-full flex flex-col h-full justify-center">
          {/* AidJobs Logo */}
          <div className="mb-12">
            <h1 className="text-3xl font-thin text-gray-900 tracking-tight">
              AidJobs
            </h1>
          </div>

          {/* Login Form */}
          <div className="flex-1 flex flex-col justify-center">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Password Input with Icons */}
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="w-full px-4 py-3 pr-24 text-sm border border-[#aaaaaa] rounded-lg 
                           bg-white text-gray-900 font-light
                           placeholder:text-gray-400
                           focus:outline-none focus:ring-2 focus:ring-[#aaaaaa] focus:ring-opacity-20 
                           focus:border-[#aaaaaa]
                           disabled:opacity-50 disabled:cursor-not-allowed
                           transition-all duration-200"
                  placeholder="Enter your password"
                  autoFocus
                  autoComplete="current-password"
                />
                {/* Show/Hide Password Icon */}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-12 top-1/2 -translate-y-1/2 p-2 text-[#aaaaaa] hover:text-gray-700 
                           transition-colors"
                  tabIndex={-1}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
                {/* Submit Button Icon */}
                <button
                  type="submit"
                  disabled={loading || !password}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-[#aaaaaa] hover:text-gray-700 
                           disabled:opacity-30 disabled:cursor-not-allowed transition-colors group"
                  title={loading ? 'Logging in...' : 'Login'}
                >
                  {loading ? (
                    <svg
                      className="animate-spin h-5 w-5"
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
                  ) : (
                    <svg 
                      className="w-5 h-5 transition-transform group-hover:translate-x-0.5" 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        strokeWidth={2} 
                        d="M13 7l5 5m0 0l-5 5m5-5H6" 
                      />
                    </svg>
                  )}
                </button>
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
                  <p className="text-sm text-red-600 flex items-center gap-2 font-light">
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
            </form>
          </div>

          {/* Footer Links and Copyright */}
          <div className="mt-auto space-y-4">
            {/* Go to AidJobs Link */}
            <div>
              <Link
                href="https://aidjobs.app"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 transition-colors font-light"
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
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                  />
                </svg>
                <span>Go to AidJobs</span>
              </Link>
            </div>

            {/* Copyright */}
            <p className="text-[10px] text-gray-400 font-light">
              © {new Date().getFullYear()} AidJobs. All rights reserved.
            </p>
          </div>
        </div>
      </div>

      {/* Right Side - Tagline (65%) */}
      <div className="hidden lg:flex lg:w-[65%] items-center justify-center px-6 xl:px-8 2xl:px-10 bg-white relative h-screen overflow-hidden">
        {/* Large Tagline Text - 3 Lines, Center Aligned */}
        <div className="relative z-10 w-full text-center">
          <h2 className="text-[7rem] xl:text-[8rem] 2xl:text-[9rem] font-semibold leading-[0.9] tracking-tight">
            <span className="text-[#bbbbbb] block">
              Become
            </span>
            <span className="text-[#bbbbbb] block">
              a
            </span>
            <span className="text-[#bbbbbb] block">
              Changemaker
            </span>
          </h2>
        </div>
      </div>

      {/* Mobile: Show tagline below login */}
      <div className="lg:hidden w-full bg-white py-8 px-8">
        <p className="text-2xl font-semibold text-center leading-tight">
          <span className="text-[#bbbbbb] block">Become</span>
          <span className="text-[#bbbbbb] block">a</span>
          <span className="text-[#bbbbbb] block">Changemaker</span>
        </p>
      </div>
    </div>
  );
}