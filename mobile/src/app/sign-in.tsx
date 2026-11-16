import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BrandMark } from "@/components/BrandMark";
import { Button, Field, PasswordField, styles } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { toE164Uganda } from "@/lib/phone";
import { useAuthMethods } from "@/lib/queries";
import { colors, radius, spacing } from "@/lib/theme";

type Method = "code" | "password";
type Via = "phone" | "email";

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export default function SignInScreen() {
  const router = useRouter();
  const { requestCode, signInWithPassword } = useAuth();
  const emailAllowed = useAuthMethods().data?.email === true;
  const [method, setMethod] = useState<Method>("code");
  const [chosenVia, setVia] = useState<Via | null>(null);
  // Email first while it's on (SMS delivery isn't live yet); phone if email sign-in is switched off.
  const via: Via = emailAllowed ? (chosenVia ?? "email") : "phone";
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /** The phone (E.164) or email to use, or null after showing why it isn't valid. */
  const validIdentifier = () => {
    if (via === "email") {
      const ok = isEmail(email);
      setPhoneError(ok ? null : "Enter a valid email address, e.g. name@example.com");
      return ok ? email.trim().toLowerCase() : null;
    }
    const e164 = toE164Uganda(phone);
    setPhoneError(e164 ? null : "Enter a valid Ugandan mobile number, e.g. 0772 123456");
    return e164;
  };

  const switchVia = () => {
    setVia(via === "phone" ? "email" : "phone");
    setPhoneError(null);
    setError(null);
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
    const id = validIdentifier();
    if (!id) return;
    void run(async () => {
      await requestCode(id);
      router.push({ pathname: "/verify", params: mode ? { phone: id, mode } : { phone: id } });
    });
  };

  const passwordSignIn = () => {
    const id = validIdentifier();
    if (!id) return;
    if (!password) return setError("Enter your password");
    // On success the auth guard swaps this screen out for the app.
    void run(() => signInWithPassword(id, password));
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
              <Text style={[s.optionText, method === m && s.optionTextOn]}>{m === "code" ? (via === "email" ? "Email code" : "SMS code") : "Password"}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.body}>
          {method === "code"
            ? via === "email"
              ? "We'll email you a 6-digit code. New here? This creates your account."
              : "We'll text you a 6-digit code to confirm your number."
            : "Use the password you set in your account."}
        </Text>

        {via === "email" ? (
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="name@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType={method === "code" ? "send" : "next"}
            onSubmitEditing={method === "code" ? submit : undefined}
            error={phoneError}
            autoFocus
          />
        ) : (
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
        )}

        {emailAllowed && (
          <Pressable onPress={switchVia} disabled={loading} style={s.switchVia} accessibilityRole="button">
            <Text style={s.linkText}>{via === "phone" ? "Use email instead" : "Use phone number instead"}</Text>
          </Pressable>
        )}

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
          disabled={!(via === "email" ? email : phone).trim() || (method === "password" && !password)}
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
  switchVia: { alignSelf: "flex-start", paddingVertical: spacing.xs, marginTop: -spacing.xs },
  linkText: { color: colors.primary, fontWeight: "600" },
});
