'use client'

import * as React from 'react'
import { CalendarIcon } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function toDate(value: string): Date | undefined {
  if (!value) return undefined
  const d = new Date(value + 'T00:00:00')
  return isNaN(d.getTime()) ? undefined : d
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10)
}

interface DatePickerProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
}

const DatePicker = React.forwardRef<HTMLButtonElement, DatePickerProps>(
  ({ value, onChange, placeholder = 'Seleccionar fecha', className }, ref) => {
    const selected = toDate(value ?? '')
    const label = selected
      ? selected.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
      : placeholder

    return (
      <Popover>
        <PopoverTrigger
          ref={ref}
          className={cn(
            buttonVariants({ variant: 'outline' }),
            'w-full justify-start font-normal',
            !selected && 'text-muted-foreground',
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          {label}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={date => onChange?.(date ? toIso(date) : '')}
            autoFocus
          />
        </PopoverContent>
      </Popover>
    )
  }
)
DatePicker.displayName = 'DatePicker'

export { DatePicker }
