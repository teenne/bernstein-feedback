import { ReactNode } from 'react';

interface GlassCardProps {
    children: ReactNode;
    className?: string;
    title?: ReactNode;
    description?: ReactNode;
    onClick?: () => void;
}

export function GlassCard({ children, className = '', title, description, onClick }: GlassCardProps) {
    return (
        <div
            onClick={onClick}
            className={`
                relative overflow-hidden
                bg-white/80 dark:bg-white/5 backdrop-blur-md 
                border border-gray-200 dark:border-white/5 
                rounded-2xl 
                p-6 
                shadow-sm dark:shadow-xl 
                transition-all duration-300
                ${onClick ? 'cursor-pointer hover:bg-white dark:hover:bg-white/10 hover:border-amber-500/30 hover:shadow-amber-500/10 hover:-translate-y-1' : ''}
                ${className}
            `}
        >
            {/* Header if title/desc provided */}
            {(title || description) && (
                <div className="mb-4">
                    {title && <h3 className="text-xl font-semibold text-gray-900 dark:text-white tracking-tight">{title}</h3>}
                    {description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{description}</p>}
                </div>
            )}

            {children}
        </div>
    );
}
