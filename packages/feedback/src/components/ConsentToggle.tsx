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
                    className="bf-w-10 bf-h-6 bf-rounded-full bf-relative bf-flex bf-items-center bf-transition-colors disabled:bf-opacity-50"
                    style={{ backgroundColor: checked ? 'var(--feedback-primary, #3b82f6)' : 'var(--feedback-border, #e5e7eb)' }}
                >
                    <Switch.Thumb
                        className="bf-block bf-w-5 bf-h-5 bf-rounded-full bf-shadow-md bf-border bf-border-feedback-border"
                        style={{
                            backgroundColor: checked ? '#ffffff' : 'var(--feedback-bg, #ffffff)',
                            transform: checked ? 'translateX(18px)' : 'translateX(2px)',
                            transition: 'transform 0.2s, background-color 0.2s',
                        }}
                    />
                </Switch.Root>
            </label>
            {children}
        </div>
    );
}
