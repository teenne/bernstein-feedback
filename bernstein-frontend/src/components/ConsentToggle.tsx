import * as Switch from '@radix-ui/react-switch';

interface ConsentToggleProps {
    label: string;
    hint?: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    disabled?: boolean;
    children?: React.ReactNode;
}

export function ConsentToggle({
    label,
    hint,
    checked,
    onCheckedChange,
    disabled,
    children,
}: ConsentToggleProps) {
    return (
        <div>
            <label className="flex items-center justify-between gap-2">
                <span className="text-sm text-feedback-text">
                    {label}
                    {hint && <span className="text-feedback-text-muted ml-1">({hint})</span>}
                </span>
                <Switch.Root
                    checked={checked}
                    onCheckedChange={onCheckedChange}
                    disabled={disabled}
                    className="w-10 h-6 bg-feedback-border rounded-full relative flex items-center data-[state=checked]:bg-feedback-primary transition-colors disabled:opacity-50"
                >
                    <Switch.Thumb className="block w-5 h-5 bg-feedback-bg rounded-full shadow-md border border-feedback-border transition-transform translate-x-0.5 data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-white" />
                </Switch.Root>
            </label>
            {children}
        </div>
    );
}
