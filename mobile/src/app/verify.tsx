import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text } from "react-native";
import { BrandMark } from "@/components/BrandMark";
import { Button, Field, PasswordField, styles } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { colors } from "@/lib/theme";

const RESEND_SECONDS = 60;

/** Enter the texted code. With mode=reset it also sets a new password (forgot password). */
export default function VerifyScreen() {
  const { phone, mode } = useLocalSearchParams<{ phone: string; mode?: string }>();
  const reset = mode === "reset";
  const { verifyCode, requestCode, resetPassword } = useAuth();
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
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
    if (reset && password.length < 8) return setPasswordError("Use at least 8 characters");
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setPasswordError(null);
    setLoading(true);
    try {
      // On success the auth guard swaps this screen out for the app.
      if (reset) await resetPassword(phone, value, password);
      else await verifyCode(phone, value);
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
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={[styles.screen, { flexGrow: 1 }]}
        keyboardShouldPersistTaps="handled"
      >
        <BrandMark />
        <Text style={styles.title} accessibilityRole="header">{reset ? "Reset your password" : "Enter your code"}</Text>
        <Text style={styles.body}>
          We sent a 6-digit code to {phone}. It expires in 10 minutes.
          {reset ? " Enter it with your new password." : ""}
        </Text>
        <Field
          label="Verification code"
          value={code}
          onChangeText={(v) => {
            const digits = v.replace(/\D/g, "").slice(0, 6);
            setCode(digits);
            // In reset mode the password is still to come, so wait for the button.
            if (!reset && digits.length === 6 && !loading) void submit(digits);
          }}
          keyboardType="number-pad"
          autoComplete="sms-otp"
          textContentType="oneTimeCode"
          maxLength={6}
          error={error}
          autoFocus
        />
        {reset && (
          <PasswordField
            label="New password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            textContentType="newPassword"
            maxLength={128}
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
            error={passwordError}
          />
        )}
        {!!info && <Text style={styles.body}>{info}</Text>}
        <Button
          title={reset ? "Save password and sign in" : "Verify"}
          onPress={() => void submit()}
          loading={loading}
          disabled={code.length !== 6 || (reset && !password)}
        />
        <Button
          title={resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
          onPress={resend}
          disabled={resendIn > 0}
          variant="secondary"
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
