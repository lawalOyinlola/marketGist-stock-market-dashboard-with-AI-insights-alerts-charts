import React from "react";
import {
  InputGroup,
  InputGroupInput,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import { Label } from "../ui/label";

const InputGroupField = ({
  name,
  label,
  placeholder,
  type = "text",
  mode = "input",
  register,
  error,
  validation,
  disabled,
  value,
  className,
  children,
}: InputGroupFieldProps) => {
  const baseProps = {
    id: name,
    placeholder,
    disabled,
    className: cn(
      { "opacity-50 cursor-not-allowed": disabled },
      error && "border-red-500 focus:border-red-500"
    ),
    "aria-invalid": !!error,
    "aria-describedby": error ? `${name}-error` : undefined,
  } as const;

  const reg = register ? register(name, validation) : undefined;
  const inputProps = reg ? { ...baseProps, ...reg } : { ...baseProps, value };

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <Label htmlFor={name} className="form-label">
          {label}
        </Label>
      )}
      <InputGroup className={cn("form-input-group overflow-hidden")}>
        {children}
        {mode === "input" ? (
          <InputGroupInput
            type={type}
            {...inputProps}
            className={cn("input-group-input", inputProps.className)}
          />
        ) : (
          <InputGroupTextarea {...inputProps} />
        )}
      </InputGroup>

      {error && (
        <p
          id={`${name}-error`}
          role="alert"
          aria-live="polite"
          className="text-sm text-red-500"
        >
          {error.message}
        </p>
      )}
    </div>
  );
};

export default InputGroupField;
