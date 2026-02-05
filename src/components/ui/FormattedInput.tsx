import * as React from "react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

interface FormattedInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    format?: 'currency-vnd' | 'currency-usd' | 'phone'
    onValueChange?: (value: string | number) => void
}

export const FormattedInput = React.forwardRef<HTMLInputElement, FormattedInputProps>(
    ({ className, format, onChange, onValueChange, ...props }, ref) => {
        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            let value = e.target.value
            let rawValue: string | number = value

            if (format === 'currency-vnd') {
                // Remove non-digits
                const numericValue = value.replace(/\D/g, "")
                rawValue = Number(numericValue)
                // Format with commas
                value = numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
            } else if (format === 'currency-usd') {
                // Simple decimal formatting
                // Allow digits and one dot
                value = value.replace(/[^0-9.]/g, '')
                const parts = value.split('.')
                if (parts.length > 2) value = parts[0] + '.' + parts.slice(1).join('')
                rawValue = Number(value)
            }

            // Update display value
            e.target.value = value

            // Trigger original onChange
            onChange?.(e)

            // Trigger custom onValueChange with raw number/string
            onValueChange?.(rawValue)
        }

        return (
            <div className="relative">
                <Input
                    ref={ref}
                    className={cn(className, format === 'currency-vnd' ? 'pr-12' : '')}
                    onChange={handleChange}
                    {...props}
                />
                {format === 'currency-vnd' && (
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-muted-foreground text-sm">
                        VND
                    </div>
                )}
                {format === 'currency-usd' && (
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-muted-foreground text-sm">
                        USD
                    </div>
                )}
            </div>
        )
    }
)
FormattedInput.displayName = "FormattedInput"
