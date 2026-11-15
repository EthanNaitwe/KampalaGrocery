import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Text } from "react-native";
import { BrandMark } from "@/components/BrandMark";
import { Button, Field, Screen, styles } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";

const RESEND_SECONDS = 60;

export default function VerifyScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const { verifyCode, requestCode } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(RESEND_SECONDS);
  // Auto-submit on the 6th digit plus a Verify tap must not spend the code twice.
  const inFlight = useRef(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const submit = async (value = code) => {
    if (!/^\d{6}$/.test(value)) return setError("Enter the 6-digit code");
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setLoading(true);
    try {
      // On success the auth guard swaps this screen out for the app.
      await verifyCode(phone, value);
    } catch (e) {
      setError(errorMessage(e));
      setCode("");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  const resend = async () => {
    setError(null);
    setInfo(null);
    try {
      await requestCode(phone);
      setInfo("A new code is on its way.");
      setResendIn(RESEND_SECONDS);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <BrandMark />
        <Text style={styles.title} accessibilityRole="header">Enter your code</Text>
        <Text style={styles.body}>We sent a 6-digit code to {phone}. It expires in 10 minutes.</Text>
        <Field
          label="Verification code"
          value={code}
          onChangeText={(v) => {
            const digits = v.replace(/\D/g, "").slice(0, 6);
            setCode(digits);
            if (digits.length === 6 && !loading) void submit(digits);
          }}
          keyboardType="number-pad"
          autoComplete="sms-otp"
          textContentType="oneTimeCode"
          maxLength={6}
          error={error}
          autoFocus
        />
        {!!info && <Text style={styles.body}>{info}</Text>}
        <Button title="Verify" onPress={() => void submit()} loading={loading} disabled={code.length !== 6} />
        <Button
          title={resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
          onPress={resend}
          disabled={resendIn > 0}
          variant="secondary"
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}
