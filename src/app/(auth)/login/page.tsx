"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Loader2,
  Eye,
  EyeOff,
  ShieldCheck,
  Sparkles,
  BarChart3,
  ArrowRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/stores/auth-store";
import { takeReturnPath } from "@/lib/returnPath";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

const features = [
  {
    icon: Sparkles,
    title: "Lead Intelligence",
    description: "Categorize and route MSP opportunities in seconds.",
  },
  {
    icon: BarChart3,
    title: "Real-time Pipeline",
    description: "Track every quote, meeting, and deal as it moves.",
  },
  {
    icon: ShieldCheck,
    title: "Role-based Access",
    description: "Each team member sees only what they need.",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (data: LoginFormData) => {
    setError(null);
    try {
      await login(data.email, data.password);
      const name = useAuthStore.getState().user?.name?.split(" ")[0];
      const next = takeReturnPath(); // back to the page they were on (e.g. a notification link)
      notify.success(name ? `Welcome back, ${name}` : "Signed in", next === "/" ? "Your next steps are on the dashboard." : undefined);
      router.push(next);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Invalid email or password";
      setError(message);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left: branded panel */}
      <div className="relative hidden overflow-hidden bg-[#0B0D12] lg:flex lg:flex-col">
        {/* Glow */}
        <div className="pointer-events-none absolute -left-20 -top-20 size-96 rounded-full bg-[#3B82F6]/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-16 size-96 rounded-full bg-[#C2F86C]/15 blur-3xl" />
        {/* Grid overlay */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:48px_48px]" />

        <div className="relative flex h-full flex-col p-10 xl:p-14">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="" width={36} height={36} className="size-9" priority />
            <span className="text-lg font-semibold text-white">MSP CRM</span>
          </div>

          {/* Headline */}
          <div className="mt-auto max-w-lg">
            <h2 className="text-4xl font-semibold leading-tight text-white xl:text-5xl">
              Turn every lead into a{" "}
              <span className="text-[#3B82F6]">closed deal</span>.
            </h2>
            <p className="mt-4 text-base text-slate-400">
              The unified workspace for MSP sales teams — from first touch to
              purchase order.
            </p>

            {/* Features */}
            <div className="mt-10 space-y-5">
              {features.map(({ icon: Icon, title, description }) => (
                <div key={title} className="flex items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[#3B82F6]">
                    <Icon className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{title}</p>
                    <p className="text-sm text-slate-400">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="mt-auto pt-10 text-xs text-slate-500">
            © {new Date().getFullYear()} MSP CRM. All rights reserved.
          </div>
        </div>
      </div>

      {/* Right: form */}
      <div className="relative flex items-center justify-center bg-muted/30 px-4 py-10 sm:px-6 lg:px-10">
        {/* Mobile background accent */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-[#3B82F6]/10 to-transparent lg:hidden" />
        {/* Decorative glows */}
        <div className="pointer-events-none absolute -top-24 right-10 hidden size-72 rounded-full bg-[#3B82F6]/10 blur-3xl lg:block" />
        <div className="pointer-events-none absolute -bottom-24 left-10 hidden size-72 rounded-full bg-[#C2F86C]/10 blur-3xl lg:block" />

        <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-xl shadow-black/5 sm:p-10">
          {/* Mobile logo */}
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <Image src="/logo.png" alt="" width={40} height={40} className="size-10" priority />
            <span className="text-xl font-semibold">MSP CRM</span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Welcome back
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to continue to your workspace.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                autoComplete="email"
                className={cn(
                  "h-11",
                  errors.email &&
                    "border-destructive focus-visible:ring-destructive/30"
                )}
                {...register("email")}
              />
              {errors.email && (
                <p className="text-xs text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button
                  type="button"
                  className="text-xs font-medium text-[#3B82F6] hover:text-[#3B82F6]/80 transition-colors"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className={cn(
                    "h-11 pr-10",
                    errors.password &&
                      "border-destructive focus-visible:ring-destructive/30"
                  )}
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="group h-11 w-full gap-2 text-sm font-medium"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
