"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import InputField from "@/components/forms/InputField";
import FooterLink from "@/components/forms/FooterLink";
import { requestPasswordReset } from "@/lib/actions/auth.actions";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { SlidingNumber } from "@/components/ui/sliding-number";

const ForgotPassword = () => {
  const [success, setSuccess] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  const remainingMs = useMemo(() => {
    if (!cooldownUntil) return 0;
    return Math.max(0, cooldownUntil - now);
  }, [cooldownUntil, now]);

  const remainingSeconds = Math.ceil(remainingMs / 1000);

  useEffect(() => {
    const stored =
      typeof window !== "undefined"
        ? localStorage.getItem("forgot_pwd_cooldown_until")
        : null;
    if (stored) {
      const ts = parseInt(stored, 10);
      if (!Number.isNaN(ts)) {
        if (ts > Date.now()) {
          setCooldownUntil(ts);
        } else if (typeof window !== "undefined") {
          localStorage.removeItem("forgot_pwd_cooldown_until");
        }
      }
    }
  }, []);

  useEffect(() => {
    if (!cooldownUntil) return;
    const tick = setInterval(() => {
      const msLeft = Math.max(0, cooldownUntil - Date.now());
      if (msLeft <= 0) {
        clearInterval(tick);
        setCooldownUntil(null);
        if (typeof window !== "undefined") {
          localStorage.removeItem("forgot_pwd_cooldown_until");
        }
      } else {
        setNow(Date.now());
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [cooldownUntil]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormData>({
    defaultValues: {
      email: "",
    },
    mode: "onBlur",
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    try {
      const result = await requestPasswordReset(data);

      if (result.success) {
        setSuccess(true);
        toast.success("Reset link sent!", {
          description: "Check your email for password reset instructions.",
        });
        // Runs in the submit handler, not during render. The compiler cannot
        // tell because onSubmit is passed through handleSubmit.
        // eslint-disable-next-line react-hooks/purity
        const until = Date.now() + 3 * 60 * 1000;
        setCooldownUntil(until);
        if (typeof window !== "undefined")
          localStorage.setItem("forgot_pwd_cooldown_until", String(until));
      } else {
        toast.error("Failed to send reset link", {
          description: result.error ?? "Please try again.",
        });
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to send reset link", {
        description: e instanceof Error ? e.message : "Please try again.",
      });
    }
  };

  return (
    <>
      <h1 className="form-title">Forgot Password</h1>

      {success ? (
        <div className="space-y-5" role="status" aria-live="polite">
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
            <p className="text-gray-400 text-sm">
              We&apos;ve sent you a password reset link. Please check your
              email.
            </p>
          </div>
          <FooterLink
            text="Remember your password?"
            linkText="Back to sign in"
            href="/sign-in"
          />
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <p className="text-gray-400 text-sm">
            Enter your email address and we&apos;ll send you a link to reset
            your password.
          </p>

          <InputField
            name="email"
            label="Email"
            placeholder="example@email.com"
            type="email"
            register={register}
            error={errors.email}
            validation={{
              required: "Email is required",
              pattern: {
                value: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
                message: "Please enter a valid email address",
              },
            }}
          />

          <Button
            type="submit"
            disabled={isSubmitting || remainingSeconds > 0}
            className="auth-btn mt-5"
          >
            {isSubmitting && <Spinner />}
            {remainingSeconds > 0 ? (
              <span className="flex items-center gap-2">
                Retry in
                <span
                  className="inline-flex items-center gap-1"
                  aria-label={`Retry in ${Math.floor(
                    remainingSeconds / 60
                  )} minutes ${remainingSeconds % 60} seconds`}
                >
                  <SlidingNumber
                    value={Math.floor(remainingSeconds / 60)}
                    padStart
                  />
                  <span>:</span>
                  <SlidingNumber value={remainingSeconds % 60} padStart />
                </span>
                min
              </span>
            ) : isSubmitting ? (
              "Sending..."
            ) : (
              "Send Reset Link"
            )}
          </Button>

          <FooterLink
            text="Remember your password?"
            linkText="Back to sign in"
            href="/sign-in"
          />
        </form>
      )}
    </>
  );
};
export default ForgotPassword;
