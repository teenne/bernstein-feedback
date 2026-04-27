import { ReactNode } from "react";

interface LayoutWrapperProps {
  children: ReactNode;
  fullHeight?: boolean;
}

export function LayoutWrapper({
  children,
  fullHeight = true,
}: LayoutWrapperProps) {
  return (
    <div
      className={`
            w-full transition-colors duration-500
            bg-gray-50 dark:bg-gray-950 
            relative overflow-hidden flex flex-col 
            ${fullHeight ? "min-h-screen" : ""} 
            text-gray-900 dark:text-gray-100
        `}
    >
      {/* Orb Background (Only visible in Dark Mode for that "Deep Space" feel) */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-amber-500/15 rounded-full blur-[120px] pointer-events-none z-0 opacity-0 dark:opacity-100 transition-opacity duration-700" />

      {/* Secondary Orb for depth (bottom right) */}
      <div className="fixed bottom-0 right-0 translate-x-1/3 translate-y-1/3 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none z-0 opacity-0 dark:opacity-100 transition-opacity duration-700" />

      {/* Grid Pattern Overlay (Subtle in light, distinct in dark) */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(0,0,0,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.03)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_60%,transparent_100%)] pointer-events-none z-0" />

      {/* Content Content */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 flex flex-col">
        {children}
      </div>
    </div>
  );
}
