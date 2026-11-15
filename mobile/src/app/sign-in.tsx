import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BrandMark } from "@/components/BrandMark";
import { Button, Field, PasswordField, styles } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { toE164Uganda } from "@/lib/phone";
import { colors, radius, spacing } from "@/lib/theme";

type Method = "code" | "password";

export default function SignInScreen() {
  const router = useRouter();
  const { requestCode, signInWithPassword } = useAuth();
  const [method, setMethod] = useState<Method>("code");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const validPhone = () => {
    const e164 = toE164Uganda(phone);
    setPhoneError(e164 ? null : "Enter a valid Ugandan mobile number, e.g. 0772 123456");
    return e164;
  };

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setLoading(true);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const sendCode = (mode?: "reset") => {
    const e164 = validPhone();
    if (!e164) return;
    void run(async () => {
      await requestCode(e164);
      router.push({ pathname: "/verify", params: mode ? { phone: e164, mode } : { phone: e164 } });
    });
  };

  const passwordSignIn = () => {
    const e164 = validPhone();
    if (!e164) return;
    if (!password) return setError("Enter your password");
    // On success the auth guard swaps this screen out for the app.
    void run(() => signInWithPassword(e164, password));
  };

  const submit = method === "code" ? () => sendCode() : passwordSignIn;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={[styles.screen, { flexGrow: 1 }]}
        keyboardShouldPersistTaps="handled"
      >
        <BrandMark />
        <Text style={styles.title} accessibilityRole="header">Sign in to FreshMart</Text>

        <View style={s.switch} accessibilityRole="tablist">
          {(["code", "password"] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => { setMethod(m); setError(null); }}
              style={[s.option, method === m && s.optionOn]}
              accessibilityRole="tab"
              accessibilityState={{ selected: method === m }}
            >
              <Text style={[s.optionText, method === m && s.optionTextOn]}>{m === "code" ? "SMS code" : "Password"}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.body}>
          {method === "code"
            ? "We'll text you a 6-digit code to confirm your number."
            : "Use the password you set in your account."}
        </Text>

        <Field
          label="Mobile number"
          value={phone}
          onChangeText={setPhone}
          placeholder="0772 123456"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          returnKeyType={method === "code" ? "send" : "next"}
          onSubmitEditing={method === "code" ? submit : undefined}
          error={phoneError}
          autoFocus
        />

        {method === "password" && (
          <PasswordField
            label="Password"
            value={password}
            onChangeText={setPassword}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
          />
        )}

        {!!error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}

        <Button
          title={method === "code" ? "Send code" : "Sign in"}
          onPress={submit}
          loading={loading}
          disabled={!phone.trim() || (method === "password" && !password)}
        />

        {method === "password" && (
          <Pressable onPress={() => sendCode("reset")} disabled={loading} style={s.link} accessibilityRole="button">
            <Text style={s.linkText}>Forgot password? Reset it with a code</Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  switch: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: radius.pill, padding: 4, borderWidth: 1, borderColor: colors.border },
  option: { flex: 1, paddingVertical: 10, borderRadius: radius.pill, alignItems: "center" },
  optionOn: { backgroundColor: colors.primary },
  optionText: { fontWeight: "600", color: colors.muted, fontSize: 15 },
  optionTextOn: { color: colors.onPrimary },
  link: { alignSelf: "center", padding: spacing.sm },
  linkText: { color: colors.primary, fontWeight: "600" },
});
