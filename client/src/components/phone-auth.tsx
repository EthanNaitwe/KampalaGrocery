import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Phone, Shield } from "lucide-react";

export default function PhoneAuth() {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();

  // Redirect to home page when user becomes authenticated
  useEffect(() => {
    console.log("PhoneAuth useEffect: isAuthenticated changed to:", isAuthenticated);
    if (isAuthenticated) {
      console.log("PhoneAuth: User authenticated, redirecting to /");
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber.trim()) {
      toast({
        title: "Error",
        description: "Please enter your phone number",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await apiRequest("/api/auth/send-otp", {
        method: "POST",
        body: { phoneNumber },
      });

      toast({
        title: "OTP Sent",
        description: "Please check your phone for the verification code",
      });
      setStep("otp");
    } catch (error: any) {
      console.error("Send OTP error:", error);
      let errorMessage = "Failed to send OTP";
      
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
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 4) {
      toast({
        title: "Error",
        description: "Please enter the 4-digit verification code",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiRequest("/api/auth/verify-otp", {
        method: "POST",
        body: { phoneNumber, otp },
      });

      console.log("OTP verification response:", response);

      toast({
        title: "Success",
        description: "Successfully signed in! Redirecting...",
      });

      // Force refetch the auth query to update the user state
      console.log("Invalidating auth query...");
      // await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      
      // Also refetch the query immediately to get the updated user data
      console.log("Refetching auth query...");
      // await queryClient.refetchQueries({ queryKey: ["/api/auth/user"] });
      
      // Manual check to see if authentication worked
      console.log("Manually checking authentication status...");
      try {
        console.log("Manually checking authentication status... 01");
        const authCheck = await apiRequest("/api/auth/user", {
          method: "GET",
          // body: { phoneNumber, otp },
        });
        // const authCheck = await fetch("/api/auth/user", {
        //   credentials: "include",
        // });
        console.log("Manual auth check status:", authCheck.status);
        if (authCheck.ok) {
          const userData = await authCheck.json();
          console.log("Manual auth check user data:", userData);
        }
        
        // Check what cookies are available
        console.log("Available cookies:", document.cookie);
        
      } catch (error) {
        console.error("Manual auth check error:", error);
      }
      
      console.log("Auth query invalidated and refetched");
      
      // Force redirect after successful verification
      console.log("Forcing redirect to home page...");
      setTimeout(() => {
        // Try to redirect first
        setLocation("/");
        
        // If redirect doesn't work, force a page reload to ensure session is loaded
        setTimeout(() => {
          console.log("Forcing page reload to ensure session is loaded...");
          window.location.reload();
        }, 2000);
      }, 1000);
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
    }
  };

  const handleBack = () => {
    setStep("phone");
    setOtp("");
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
            Enter your phone number to get started with SMS verification
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+256 700 123 456"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                disabled={isLoading}
                className="text-center"
              />
              <p className="text-sm text-muted-foreground">
                We'll send you a 4-digit verification code
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending OTP...
                </>
              ) : (
                "Send Verification Code"
              )}
            </Button>
          </form>
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
        <CardTitle className="text-2xl font-poppins">Verify Your Phone</CardTitle>
        <CardDescription>
          Enter the 4-digit code sent to {phoneNumber}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleVerifyOtp} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="otp" className="text-center block">Verification Code</Label>
            <div className="flex justify-center">
              <InputOTP
                maxLength={4}
                value={otp}
                onChange={setOtp}
                disabled={isLoading}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>
          
          <div className="space-y-3">
            <Button type="submit" className="w-full" disabled={isLoading || otp.length !== 4}>
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
          </div>
        </form>
      </CardContent>
    </Card>
  );
}