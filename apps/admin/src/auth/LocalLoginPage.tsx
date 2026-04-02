import { useState } from 'react';

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'admin';

interface LocalLoginPageProps {
    onLogin: () => void;
}

export default function LocalLoginPage({ onLogin }: LocalLoginPageProps) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (password === ADMIN_PASSWORD) {
            sessionStorage.setItem('feedback_admin_auth', 'true');
            onLogin();
        } else {
            setError('Invalid password');
        }
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
                    Welcome Back
                </h2>
                <p className="text-gray-500 mt-2 text-base">
                    Sign in to manage your feedback dashboard
                </p>
            </div>

            {/* Glassmorphic Card */}
            <div className="relative z-10 w-full max-w-md bg-white/80 dark:bg-white/5 backdrop-blur-2xl border border-gray-200 dark:border-white/10 rounded-3xl shadow-2xl p-8">
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div>
                        <label className="text-gray-700 dark:text-gray-300 text-sm font-medium mb-1 block">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => { setPassword(e.target.value); setError(''); }}
                            placeholder="Enter admin password"
                            autoFocus
                            className="w-full px-3 py-3 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-black/20 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                        />
                    </div>
                    {error && <p className="text-red-500 text-sm">{error}</p>}
                    <button
                        type="submit"
                        className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg shadow-lg shadow-amber-500/20 transition-all active:scale-[0.98]"
                    >
                        Sign In
                    </button>
                </form>
            </div>

            {/* Footer */}
            <div className="relative z-10 mt-8 text-center">
                <p className="text-gray-500 text-xs font-medium">BERNSTEIN FEEDBACK ADMIN</p>
            </div>
        </div>
    );
}
