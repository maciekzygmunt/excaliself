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
  "id" | "name" | "value" | "onBlur" | "onChange" | "aria-invalid"
>

/** Wraps a TanStack Form field with the project's Input + label + error styling. */
export function FormTextField({ field, label, ...input }: Props) {
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel
        htmlFor={field.name}
        className="text-sm text-muted-foreground"
      >
        {label}
      </FieldLabel>
      <Input
        id={field.name}
        name={field.name}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        aria-invalid={isInvalid}
        {...input}
      />
      {isInvalid && <FieldError errors={field.state.meta.errors} />}
    </Field>
  )
}

export { FieldGroup }
