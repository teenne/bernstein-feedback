import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useFeedbackConfig } from '../hooks/useFeedbackConfig';
import { AuthToast } from '../components/AuthToast';

type Mode = 'login' | 'register';
type OAuthProvider = 'google' | 'github';

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

export default function LoginPage() {
    const { config } = useFeedbackConfig();
    const isDark = config.darkMode;

    const [mode, setMode] = useState<Mode>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [loading, setLoading] = useState(false);

    const resetMessages = () => { setError(''); setInfo(''); };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        resetMessages();

        if (!supabase) {
            setError('Supabase is not configured.');
            return;
        }

        if (!email || !password) {
            setError('Email and password are required.');
            return;
        }

        if (mode === 'register') {
            if (password.length < 6) {
                setError('Password must be at least 6 characters.');
                return;
            }
            if (password !== confirmPassword) {
                setError('Passwords do not match.');
                return;
            }
        }

        setLoading(true);
        try {
            if (mode === 'login') {
                // Write the flash BEFORE the network request. Supabase fires
                // onAuthStateChange(SIGNED_IN) before signInWithPassword's
                // promise resolves, and App.tsx drains sessionStorage on the
                // isLoggedIn transition. If we set it after await, the drain
                // has already run and the toast is lost.
                sessionStorage.setItem(
                    'auth_flash',
                    JSON.stringify({ kind: 'success', message: 'Signed in successfully.' }),
                );
                const { error: err } = await supabase.auth.signInWithPassword({ email: email.toLowerCase(), password });
                if (err) {
                    // Login failed — remove the pre-staged flash so a later
                    // successful login doesn't show a stale toast.
                    sessionStorage.removeItem('auth_flash');
                    setError(err.message);
                }
                // On success, AuthGateway's onAuthStateChange listener handles redirect.
            } else {
                const { data, error: err } = await supabase.auth.signUp({
                    email: email.toLowerCase(),
                    password,
                    options: {
                        emailRedirectTo: `${window.location.origin}/feedback`,
                    },
                });
                if (err) {
                    setError(err.message);
                } else if (data.user && (!data.user.identities || data.user.identities.length === 0)) {
                    // Supabase's email-enumeration protection: when the email
                    // is already registered, the API returns a fake user with
                    // identities: []. We surface this as a clear error so the
                    // user isn't left wondering why no confirmation email ever
                    // arrives.
                    setError('An account with this email already exists. Please sign in instead.');
                } else if (data.user && !data.session) {
                    // Email confirmation required
                    setInfo('Account created. Check your email to confirm before signing in.');
                    setMode('login');
                    setPassword('');
                    setConfirmPassword('');
                }
                // If session is returned, AuthGateway redirects automatically.
            }
        } catch (err: any) {
            setError(err?.message || 'Authentication failed.');
        }
        setLoading(false);
    };

    const handleOAuth = async (provider: OAuthProvider) => {
        if (!supabase) {
            setError('Supabase is not configured.');
            return;
        }
        resetMessages();
        setLoading(true);
        const { error: err } = await supabase.auth.signInWithOAuth({
            provider,
            options: { redirectTo: `${window.location.origin}/feedback` },
        });
        if (err) {
            setError(err.message);
            setLoading(false);
        }
    };

    const switchMode = () => {
        setMode(mode === 'login' ? 'register' : 'login');
        setConfirmPassword('');
        setShowConfirmPassword(false);
        resetMessages();
    };

    const inputClass = 'w-full px-3 py-3 pr-10 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-black/20 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all';
    const eyeButtonClass = 'absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-amber-500 dark:text-gray-400 dark:hover:text-amber-400 transition-colors';

    return (
        <div className="min-h-screen w-full bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center p-4 relative overflow-hidden transition-colors duration-500">
            <AuthToast
                message={error}
                kind="error"
                onDismiss={() => setError('')}
            />
            <AuthToast
                message={info}
                kind="success"
                onDismiss={() => setInfo('')}
            />
            {/* Orb Background (Dark Mode Only) - Primary */}
            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none transition-opacity duration-700 ${isDark ? 'opacity-100' : 'opacity-0'}`} />

            {/* Orb Background (Dark Mode Only) - Secondary for better coverage */}
            <div className={`absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none transition-opacity duration-700 ${isDark ? 'opacity-100' : 'opacity-0'}`} />

            {/* Grid Pattern Overlay - Full Screen No Mask */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.03)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none" />

            {/* GIANT BACKGROUND TEXT */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none z-0 w-full text-center">
                <h1 className="text-[10vw] font-black text-gray-900/[0.04] dark:text-white/[0.03] tracking-tighter leading-none whitespace-nowrap transition-colors duration-500">
                    BERNSTEIN
                </h1>
            </div>

            {/* Header - Optimized Placement */}
            <div className="relative z-10 mb-8 text-center flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="mb-6 relative group">
                    {/* Glowing effect behind logo */}
                    <div className="absolute inset-0 bg-amber-500/20 blur-xl rounded-full group-hover:bg-amber-500/30 transition-all duration-500" />
                    <a href="/" onClick={(e) => { e.preventDefault(); window.location.reload(); }} className="cursor-pointer block">
                        <img src="/Logo.png" alt="Bernstein Logo" className="relative w-24 h-24 object-contain drop-shadow-2xl transition-transform duration-500 group-hover:scale-105" />
                    </a>
                </div>

                <h2 className="text-4xl font-bold text-gray-900 dark:text-white tracking-tight transition-colors duration-500">
                    {mode === 'login' ? 'Welcome Back' : 'Create Account'}
                </h2>
                <p className="text-gray-500 dark:text-gray-400 mt-2 text-base transition-colors duration-500">
                    {mode === 'login' ? 'Sign in to manage your feedback widgets' : 'Set up your admin account in seconds'}
                </p>
            </div>

            {/* Glassmorphic Card */}
            <div className="relative z-10 w-full max-w-md bg-white/80 dark:bg-white/5 backdrop-blur-2xl border border-gray-200 dark:border-white/10 rounded-3xl shadow-2xl dark:shadow-black/50 p-8 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100 transition-all duration-500">
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    {/* Email */}
                    <div>
                        <label className="text-gray-700 dark:text-gray-300 text-sm font-medium mb-1 block">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => { setEmail(e.target.value); resetMessages(); }}
                            placeholder="you@example.com"
                            autoComplete="email"
                            autoFocus
                            className={inputClass.replace(' pr-10', '')}
                        />
                    </div>

                    {/* Password */}
                    <div>
                        <label className="text-gray-700 dark:text-gray-300 text-sm font-medium mb-1 block">Password</label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => { setPassword(e.target.value); resetMessages(); }}
                                placeholder={mode === 'register' ? 'Min 6 characters' : 'Enter your password'}
                                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                                className={inputClass}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                                className={eyeButtonClass}
                            >
                                <EyeIcon open={showPassword} />
                            </button>
                        </div>
                    </div>

                    {/* Confirm Password (register only) */}
                    {mode === 'register' && (
                        <div>
                            <label className="text-gray-700 dark:text-gray-300 text-sm font-medium mb-1 block">Confirm Password</label>
                            <div className="relative">
                                <input
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={(e) => { setConfirmPassword(e.target.value); resetMessages(); }}
                                    placeholder="Re-enter password"
                                    autoComplete="new-password"
                                    className={inputClass}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword((v) => !v)}
                                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                                    className={eyeButtonClass}
                                >
                                    <EyeIcon open={showConfirmPassword} />
                                </button>
                            </div>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg shadow-lg shadow-amber-500/20 transition-all active:scale-[0.98]"
                    >
                        {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
                    </button>
                </form>

                {/* Divider */}
                <div className="flex items-center gap-3 my-6">
                    <div className="flex-1 h-px bg-gray-200 dark:bg-white/10" />
                    <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">or continue with</span>
                    <div className="flex-1 h-px bg-gray-200 dark:bg-white/10" />
                </div>

                {/* OAuth providers */}
                <div className="flex flex-col gap-3">
                    <button
                        type="button"
                        onClick={() => handleOAuth('google')}
                        disabled={loading}
                        className="w-full py-3 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 dark:text-white font-medium rounded-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.35-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.93l3.66-2.83Z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38Z"/></svg>
                        Continue with Google
                    </button>
                    <button
                        type="button"
                        onClick={() => handleOAuth('github')}
                        disabled={loading}
                        className="w-full py-3 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 dark:text-white font-medium rounded-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.25 3.34.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.21-1.5 3.18-1.18 3.18-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.26 5.69.41.36.78 1.05.78 2.13v3.16c0 .31.21.67.79.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5Z"/></svg>
                        Continue with GitHub
                    </button>
                </div>

                {/* Mode toggle */}
                <div className="mt-6 text-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
                        <button
                            type="button"
                            onClick={switchMode}
                            className="text-amber-600 dark:text-amber-500 hover:text-amber-500 dark:hover:text-amber-400 font-medium transition-colors"
                        >
                            {mode === 'login' ? 'Sign Up' : 'Sign In'}
                        </button>
                    </p>
                </div>
            </div>

            {/* Footer */}
            <div className='relative z-10 mt-8 text-center'>
                <p className='text-gray-500 dark:text-gray-600 text-xs font-medium transition-colors duration-500'>
                    BERNSTEIN DEVELOPER PORTAL
                </p>
            </div>
        </div>
    );
}
