interface LoadingSpinnerProps {
    message?: string;
}

export function LoadingSpinner({ message = 'Loading...' }: LoadingSpinnerProps) {
    return (
        <div className="flex flex-col items-center justify-center py-20">
            <div className="h-10 w-10 border-2 border-amber-500 rounded-full border-t-transparent animate-spin mb-4" />
            <p className="text-sm text-gray-400">{message}</p>
        </div>
    );
}
