"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email");
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading"
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    const unsubscribe = async () => {
      if (!email || !token) {
        setStatus("error");
        setMessage("Invalid unsubscribe link. Please contact support.");
        return;
      }

      try {
        const response = await fetch("/api/unsubscribe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, token }),
        });

        const data = await response.json();

        if (response.ok) {
          setStatus("success");
          setMessage(
            data.message || "You have been successfully unsubscribed."
          );
        } else {
          setStatus("error");
          setMessage(data.error || "Failed to unsubscribe. Please try again.");
        }
      } catch (error) {
        setStatus("error");
        setMessage("An error occurred. Please try again later.");
      }
    };

    unsubscribe();
  }, [email, token]);

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-gray-800 border border-gray-600 rounded-lg p-8">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Image
            src="/assets/images/logo-marketgist.png"
            alt="Marketgist Logo"
            width={150}
            height={40}
            className="h-10 w-auto"
          />
        </div>

        {/* Status Message */}
        <div className="text-center">
          {status === "loading" && (
            <>
              <div className="mb-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#22c55e] mx-auto"></div>
              </div>
              <h1 className="text-2xl font-semibold text-gray-100 mb-2">
                Processing...
              </h1>
              <p className="text-gray-400">
                Updating your email preferences...
              </p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="mb-4">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-500/10">
                  <svg
                    className="h-6 w-6 text-green-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              </div>
              <h1 className="text-2xl font-semibold text-gray-100 mb-2">
                Unsubscribed Successfully
              </h1>
              <p className="text-gray-400 mb-6">{message}</p>
              <p className="text-sm text-gray-500">
                You will no longer receive email notifications from Marketgist.
              </p>
            </>
          )}

          {status === "error" && (
            <>
              <div className="mb-4">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-500/10">
                  <svg
                    className="h-6 w-6 text-red-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </div>
              </div>
              <h1 className="text-2xl font-semibold text-gray-100 mb-2">
                Error
              </h1>
              <p className="text-gray-400 mb-6">{message}</p>
            </>
          )}

          {/* Actions */}
          <div className="mt-8 space-y-3">
            <Link
              href="/"
              className="block w-full bg-[#22c55e] hover:bg-[#22c55e]/90 text-gray-900 font-medium py-3 px-4 rounded-lg transition-colors text-center"
            >
              Go to Dashboard
            </Link>
            {(status === "success" || status === "error") && (
              <Link
                href="/sign-in"
                className="block w-full bg-gray-700 hover:bg-gray-600 text-gray-100 font-medium py-3 px-4 rounded-lg transition-colors text-center"
              >
                Sign In
              </Link>
            )}
          </div>

          {/* Help Text */}
          <p className="mt-6 text-sm text-gray-500">
            Need help?{" "}
            <a
              href="mailto:support@marketgist.com"
              className="text-[#22c55e] hover:underline"
            >
              Contact Support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-gray-800 border border-gray-600 rounded-lg p-8">
            <div className="flex justify-center mb-8">
              <Image
                src="/assets/images/logo-marketgist.png"
                alt="Marketgist Logo"
                width={150}
                height={40}
                className="h-10 w-auto"
              />
            </div>
            <div className="text-center">
              <div className="mb-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#22c55e] mx-auto"></div>
              </div>
              <h1 className="text-2xl font-semibold text-gray-100 mb-2">
                Loading...
              </h1>
            </div>
          </div>
        </div>
      }
    >
      <UnsubscribeContent />
    </Suspense>
  );
}
