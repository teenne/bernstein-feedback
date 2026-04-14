import { useState } from 'react';
import { API_URL, SESSION_KEYS } from '../lib/config';

interface LocalLoginPageProps {
    onLogin: () => void;
}

const EyeIcon = ({ open }: { open: boolean }) => (
    open ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
            <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
            <line x1="2" x2="22" y1="2" y2="22" />
        </svg>
    )
);

export default function LocalLoginPage({ onLogin }: LocalLoginPageProps) {
    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!email || !password) {
            setError('Email and password are required');
            return;
        }

        if (mode === 'register' && password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (mode === 'register' && password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        setLoading(true);
        try {
            const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
            const res = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.toLowerCase(), password }),
            });

            const json = await res.json();
            if (!json.success) {
                setError(json.error || 'Authentication failed');
                setLoading(false);
                return;
            }

            const { token, user_id, role } = json.data;
            // Store session
            sessionStorage.setItem(SESSION_KEYS.AUTH, 'true');
            sessionStorage.setItem(SESSION_KEYS.TOKEN, token);
            sessionStorage.setItem(SESSION_KEYS.LOCAL_USER, JSON.stringify({
                user_id,
                email: email.toLowerCase(),
                role,
            }));
            // Notify useAuth to re-read session
            window.dispatchEvent(new Event('local-auth-change'));
            onLogin();
        } catch (err) {
            setError('Could not connect to server. Is it running?');
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen w-full bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
            {/* Orb Background */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />

            {/* Grid Pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.03)_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none" />

            {/* Background Text */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none z-0 w-full text-center">
                <h1 className="text-[10vw] font-black text-gray-900/[0.04] tracking-tighter leading-none whitespace-nowrap">
                    BERNSTEIN
                </h1>
            </div>

            {/* Header */}
            <div className="relative z-10 mb-8 text-center flex flex-col items-center">
                <div className="mb-6 relative">
                    <div className="absolute inset-0 bg-amber-500/20 blur-xl rounded-full" />
                    <img src="/Logo.png" alt="Bernstein" className="relative w-24 h-24 object-contain drop-shadow-2xl" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                </div>
                <h2 className="text-4xl font-bold text-gray-900 dark:text-white tracking-tight">
                    {mode === 'login' ? 'Welcome Back' : 'Create Account'}
                </h2>
                <p className="text-gray-500 mt-2 text-base">
                    {mode === 'login' ? 'Sign in to your feedback dashboard' : 'Set up your admin account'}
                </p>
            </div>

            {/* Glassmorphic Card */}
            <div className="relative z-10 w-full max-w-md bg-white/80 dark:bg-white/5 backdrop-blur-2xl border border-gray-200 dark:border-white/10 rounded-3xl shadow-2xl p-8">
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div>
                        <label className="text-gray-700 dark:text-gray-300 text-sm font-medium mb-1 block">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => { setEmail(e.target.value); setError(''); }}
                            placeholder="you@example.com"
                            autoFocus
                            className="w-full px-3 py-3 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-black/20 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                        />
                    </div>
                    <div>
                        <label className="text-gray-700 dark:text-gray-300 text-sm font-medium mb-1 block">Password</label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                                placeholder={mode === 'register' ? 'Min 6 characters' : 'Enter your password'}
                                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                                className="w-full px-3 py-3 pr-10 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-black/20 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-amber-500 dark:text-gray-400 dark:hover:text-amber-400 transition-colors"
                            >
                                <EyeIcon open={showPassword} />
                            </button>
                        </div>
                    </div>
                    {mode === 'register' && (
                        <div>
                            <label className="text-gray-700 dark:text-gray-300 text-sm font-medium mb-1 block">Confirm Password</label>
                            <div className="relative">
                                <input
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                                    placeholder="Re-enter password"
                                    autoComplete="new-password"
                                    className="w-full px-3 py-3 pr-10 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-black/20 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword((v) => !v)}
                                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-amber-500 dark:text-gray-400 dark:hover:text-amber-400 transition-colors"
                                >
                                    <EyeIcon open={showConfirmPassword} />
                                </button>
                            </div>
                        </div>
                    )}
                    {error && <p className="text-red-500 text-sm">{error}</p>}
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg shadow-lg shadow-amber-500/20 transition-all active:scale-[0.98]"
                    >
                        {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
                        <button
                            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setConfirmPassword(''); setShowConfirmPassword(false); }}
                            className="text-amber-500 hover:text-amber-600 font-medium transition-colors"
                        >
                            {mode === 'login' ? 'Sign Up' : 'Sign In'}
                        </button>
                    </p>
                    {mode === 'register' && (
                        <p className="text-xs text-gray-400 mt-2">
                            First account automatically becomes admin.
                        </p>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="relative z-10 mt-8 text-center">
                <p className="text-gray-500 text-xs font-medium">BERNSTEIN FEEDBACK ADMIN</p>
            </div>
        </div>
    );
}
