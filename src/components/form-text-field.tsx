import type { AnyFieldApi } from "@tanstack/react-form"
import type { ComponentProps } from "react"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

type Props = {
  field: AnyFieldApi
  label: string
} & Omit<
  ComponentProps<typeof Input>,
  "name" | "value" | "onBlur" | "onChange" | "aria-invalid"
>

/** Wraps a TanStack Form field with the project's Input + label + error styling. */
export function FormTextField({ field, label, ...input }: Props) {
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
  // The DOM id defaults to the field name — pass `id` when two forms on one
  // page share a field name, or the label/input wiring silently crosses.
  const id = input.id ?? field.name
  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </FieldLabel>
      <Input
        {...input}
        id={id}
        name={field.name}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        aria-invalid={isInvalid}
      />
      {isInvalid && <FieldError errors={field.state.meta.errors} />}
    </Field>
  )
}

export { FieldGroup }
