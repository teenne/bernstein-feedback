import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '../lib/supabaseClient';
import { useFeedbackConfig } from '../hooks/useFeedbackConfig';

export default function LoginPage() {
    const { config } = useFeedbackConfig();
    const isDark = config.darkMode;

    return (
        <div className="min-h-screen w-full bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center p-4 relative overflow-hidden transition-colors duration-500">
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
                    Welcome Back
                </h2>
                <p className="text-gray-500 dark:text-gray-400 mt-2 text-base transition-colors duration-500">
                    Sign in to manage your feedback widgets
                </p>
            </div>

            {/* Glassmorphic Card */}
            <div className="relative z-10 w-full max-w-md bg-white/80 dark:bg-white/5 backdrop-blur-2xl border border-gray-200 dark:border-white/10 rounded-3xl shadow-2xl dark:shadow-black/50 p-8 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100 transition-all duration-500">
                <Auth
                    supabaseClient={supabase as any}
                    appearance={{
                        theme: ThemeSupa,
                        variables: {
                            default: {
                                colors: {
                                    brand: '#f59e0b', // Amber-500
                                    brandAccent: '#d97706', // Amber-600
                                    brandButtonText: 'white',
                                    defaultButtonBackground: isDark ? '#27272a' : '#f3f4f6', // Zinc-800 vs Gray-100
                                    defaultButtonBackgroundHover: isDark ? '#3f3f46' : '#e5e7eb', // Zinc-700 vs Gray-200
                                    inputBackground: isDark ? 'rgba(0,0,0,0.2)' : 'white',
                                    inputBorder: isDark ? 'rgba(255,255,255,0.1)' : '#e5e7eb',
                                    inputBorderHover: 'rgba(245,158,11,0.5)',
                                    inputBorderFocus: '#f59e0b',
                                    inputText: isDark ? 'white' : '#111827',
                                    inputPlaceholder: isDark ? '#71717a' : '#9ca3af',
                                    defaultButtonText: isDark ? 'white' : '#111827',
                                },
                                space: {
                                    inputPadding: '12px',
                                    buttonPadding: '12px',
                                },
                                borderWidths: {
                                    buttonBorderWidth: '0px',
                                    inputBorderWidth: '1px',
                                },
                                radii: {
                                    borderRadiusButton: '8px',
                                    buttonBorderRadius: '8px',
                                    inputBorderRadius: '8px',
                                },
                                fonts: {
                                    bodyFontFamily: '"Inter", sans-serif',
                                    buttonFontFamily: '"Inter", sans-serif',
                                },
                            },
                        },
                        className: {
                            container: 'flex flex-col gap-4',
                            button: 'font-medium shadow-lg transition-all active:scale-[0.98]',
                            input: 'transition-all focus:ring-2 focus:ring-amber-500/20 outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500',
                            label: 'text-gray-700 dark:text-gray-300 text-sm font-medium mb-1 transition-colors',
                            loader: 'text-amber-500',
                            anchor: 'text-amber-600 dark:text-amber-500 hover:text-amber-500 dark:hover:text-amber-400 transition-colors text-sm text-center block mt-2',
                        }
                    }}
                    providers={['google', 'github']}
                    theme={isDark ? 'dark' : 'default'}
                    showLinks={true}
                />
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
