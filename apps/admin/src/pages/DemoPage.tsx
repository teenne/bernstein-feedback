import { useFeedback } from '@bernstein/feedback';
import { LayoutWrapper } from '../components/LayoutWrapper';
import { GlassCard } from '../components/GlassCard';

export function DemoApp() {
    const { openFeedback, openBugReport, reportBug } = useFeedback();

    return (
        <LayoutWrapper>
            <div className="space-y-4 max-w-4xl mx-auto w-full">

                {/* Hero Section */}
                <div className="text-center py-12">
                    <h2 className="text-4xl md:text-5xl font-bold text-amber-500 dark:text-amber-500 mb-6 drop-shadow-sm pb-2">
                        Experience the Feedback Widget
                    </h2>
                    <p className="text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed">
                        This environment demonstrates the capabilities of Bernstein.
                        Interact with the components below to trigger various feedback scenarios.
                    </p>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                    {/* Triggers Card */}
                    <GlassCard title="Interactive Triggers" description="Manually open different feedback forms.">
                        <div className="flex flex-wrap gap-4 mt-4">
                            <button
                                onClick={() => openFeedback()}
                                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg shadow-lg hover:shadow-amber-500/25 transition-all active:scale-95"
                            >
                                Open Feedback
                            </button>
                            <button
                                onClick={() => openBugReport()}
                                className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-medium rounded-lg border border-transparent hover:border-white/20 transition-all active:scale-95"
                            >
                                Report Bug
                            </button>
                        </div>
                    </GlassCard>

                    {/* Pre-filled Card */}
                    <GlassCard title="Context-Aware Reporting" description="Simulate a crash state with pre-filled details.">
                        <div className="mt-4">
                            <button
                                onClick={() => reportBug({ title: 'Application Crash', description: 'I clicked the specific action button and the app froze.' })}
                                className="w-full px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium rounded-lg shadow-lg transition-all active:scale-95"
                            >
                                Simulate Crash Report
                            </button>
                        </div>
                    </GlassCard>
                </div>

                {/* Technical Test Card */}
                <GlassCard
                    title="Capture Diagnostics"
                    description="Trigger console errors and network failures to test automatic capture."
                    className="border-amber-500/30 shadow-[0_0_30px_rgba(245,158,11,0.1)]"
                >
                    <div className="flex gap-4 mt-4">
                        <button
                            onClick={() => console.error('Test console error for capture')}
                            className="flex-1 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 hover:border-red-500/40 rounded-lg transition-all"
                        >
                            Log Console Error
                        </button>
                        <button
                            onClick={() => fetch('https://non-existent-api.test/fail')}
                            className="flex-1 px-4 py-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20 hover:border-orange-500/40 rounded-lg transition-all"
                        >
                            Simulate Network Fail
                        </button>
                    </div>
                    <p className="mt-4 text-xs text-gray-500 text-center">
                        Open your browser console (F12) to verify these actions.
                    </p>
                </GlassCard>
            </div>
        </LayoutWrapper>
    );
}
