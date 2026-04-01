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
            <label className="bf-flex bf-items-center bf-justify-between bf-gap-2">
                <span className="bf-text-sm bf-text-feedback-text">
                    {label}
                    {hint && <span className="bf-text-feedback-text-muted bf-ml-1">({hint})</span>}
                </span>
                <Switch.Root
                    checked={checked}
                    onCheckedChange={onCheckedChange}
                    disabled={disabled}
                    className="bf-w-10 bf-h-6 bf-bg-feedback-border bf-rounded-full bf-relative bf-flex bf-items-center data-[state=checked]:bf-bg-feedback-primary bf-transition-colors disabled:bf-opacity-50"
                >
                    <Switch.Thumb className="bf-block bf-w-5 bf-h-5 bf-bg-feedback-bg bf-rounded-full bf-shadow-md bf-border bf-border-feedback-border bf-transition-transform bf-translate-x-0.5 data-[state=checked]:bf-translate-x-[18px] data-[state=checked]:bf-bg-white" />
                </Switch.Root>
            </label>
            {children}
        </div>
    );
}
