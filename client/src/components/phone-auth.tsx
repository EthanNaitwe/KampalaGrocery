import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Phone, Shield } from "lucide-react";

export default function PhoneAuth({ hideAuthLogin }: { hideAuthLogin: () => void }) {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [authMethod, setAuthMethod] = useState<"phone" | "email">("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const [resendCooldown, setResendCooldown] = useState(0);

  // Redirect to home page when user becomes authenticated
  useEffect(() => {
    console.log("PhoneAuth useEffect: isAuthenticated changed to:", isAuthenticated);
    if (isAuthenticated) {
      console.log("PhoneAuth: User authenticated, redirecting to /");
      hideAuthLogin();
    }
  }, [isAuthenticated]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const identifier = authMethod === "phone" ? phoneNumber : email;

    if (!identifier.trim()) {
      toast({
        title: "Error",
        description: authMethod === "phone" ? "Please enter your phone number" : "Please enter your email address",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const endpoint = authMethod === "phone" ? "/api/auth/send-otp" : "/api/auth/send-email-otp";
      const payload = authMethod === "phone" ? { phoneNumber } : { email };

      await apiRequest(endpoint, {
        method: "POST",
        body: payload,
      });

      toast({
        title: authMethod === "phone" ? "OTP Sent" : "Verification Email Sent",
        description: authMethod === "phone"
          ? "Please check your phone for the verification code"
          : "Please check your email for the verification code",
      });
      setStep("otp");
    } catch (error: any) {
      console.error("Send OTP error:", error);
      let errorMessage = authMethod === "phone" ? "Failed to send OTP" : "Failed to send verification email";

      if (error.message) {
        const match = error.message.match(/\d+:\s*(.+)/);
        errorMessage = match ? match[1] : error.message;
      }

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      toast({
        title: "Error",
        description: "Please enter the 6-digit verification code",
        variant: "destructive",
      });
      return;
    }

    const identifier = authMethod === "phone" ? phoneNumber : email;

    setIsLoading(true);
    try {
      const endpoint = authMethod === "phone" ? "/api/auth/verify-otp" : "/api/auth/verify-email-otp";
      const response = await apiRequest(endpoint, {
        method: "POST",
        body: authMethod === "phone" ? { phoneNumber, otp } : { email, otp },
      });

      console.log("OTP verification response:", response);

      toast({
        title: "Success",
        description: "Successfully signed in! Redirecting...",
      });

      console.log("Verification succeeded; closing auth UI.");
      setIsLoading(false);

      // Refresh the cached user so UI recognizes the active session
      try {
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      } catch (err) {
        console.error('Failed to invalidate /api/auth/user query:', err);
      }
    } catch (error: any) {
      console.error("Verify OTP error:", error);
      let errorMessage = "Invalid verification code";

      if (error.message) {
        // Extract meaningful error message
        const match = error.message.match(/\d+:\s*(.+)/);
        errorMessage = match ? match[1] : error.message;
      }

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      hideAuthLogin();
    }
  };

  const handleResendOtp = async () => {
    const identifier = authMethod === "phone" ? phoneNumber : email;

    if (!identifier.trim()) {
      toast({ title: "Error", description: "No phone or email to resend to", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      const endpoint = authMethod === "phone" ? "/api/auth/send-otp" : "/api/auth/send-email-otp";
      await apiRequest(endpoint, {
        method: "POST",
        body: authMethod === "phone" ? { phoneNumber } : { email },
      });

      toast({ title: "OTP Sent", description: "A new verification code was sent" });
      setResendCooldown(30);
    } catch (error: any) {
      console.error("Resend OTP error:", error);
      let errorMessage = "Failed to resend OTP";
      if (error.message) {
        const match = error.message.match(/\d+:\s*(.+)/);
        errorMessage = match ? match[1] : error.message;
      }
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  // Countdown for resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => {
      setResendCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  const handleBack = () => {
    setStep("phone");
    setOtp("");
  };

  const handleGoogleSignIn = () => {
    window.location.href = "/api/auth/google";
  };

  if (step === "phone") {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Phone className="text-primary" size={32} />
          </div>
          <CardTitle className="text-2xl font-poppins">Welcome to FreshMart</CardTitle>
          <CardDescription>
            {authMethod === "phone"
              ? "Enter your phone number to get started with SMS verification"
              : "Enter your email address to receive a verification code"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex rounded-md border border-border p-1">
            <button
              type="button"
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${authMethod === "phone" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              onClick={() => setAuthMethod("phone")}
            >
              Phone
            </button>
            <button
              type="button"
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${authMethod === "email" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              onClick={() => setAuthMethod("email")}
            >
              Email
            </button>
          </div>

          <form onSubmit={handleSendOtp} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={authMethod === "phone" ? "phone" : "email"}>
                {authMethod === "phone" ? "Phone Number" : "Email Address"}
              </Label>
              {authMethod === "phone" ? (
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+256 700 123 456"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  disabled={isLoading}
                  className="text-center"
                />
              ) : (
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  className="text-center"
                />
              )}
              <p className="text-sm text-muted-foreground">
                We'll send you a 6-digit verification code
              </p>
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || (authMethod === "phone" ? !phoneNumber.trim() : !email.trim())}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending OTP...
                </>
              ) : (
                authMethod === "phone" ? "Send Verification Code" : "Send Verification Email"
              )}
            </Button>
          </form>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>

          <Button type="button" variant="outline" className="w-full" onClick={handleGoogleSignIn}>
            Continue with Google
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <Shield className="text-primary" size={32} />
        </div>
        <CardTitle className="text-2xl font-poppins">
          {authMethod === "phone" ? "Verify Your Phone" : "Verify Your Email"}
        </CardTitle>
        <CardDescription>
          Enter the 6-digit code sent to {authMethod === "phone" ? phoneNumber : email}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleVerifyOtp} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="otp" className="text-center block">Verification Code</Label>
            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={otp}
                onChange={setOtp}
                disabled={isLoading}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>

          <div className="space-y-3">
            <Button type="submit" className="w-full" disabled={isLoading || otp.length !== 6}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Verify Code"
              )}
            </Button>

            <Button type="button" variant="outline" className="w-full" onClick={handleBack} disabled={isLoading}>
              Use Different Number
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={handleResendOtp}
              disabled={isLoading || resendCooldown > 0}
            >
              {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : "Resend code"}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={hideAuthLogin}
              disabled={isLoading || resendCooldown > 0}
            >
              {resendCooldown > 0 ? `Resend codez (${resendCooldown}s)` : "Resend codez"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}