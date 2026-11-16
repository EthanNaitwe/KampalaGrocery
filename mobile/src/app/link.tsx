import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text } from "react-native";
import { Button, Field, styles } from "@/components/ui";
import { errorMessage } from "@/lib/errors";
import { toE164Uganda } from "@/lib/phone";
import { useFinishLink, useStartLink } from "@/lib/queries";
import { colors } from "@/lib/theme";

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

/** Add a phone number or email to the account (?kind=phone|email): send a code, then confirm it. */
export default function LinkScreen() {
  const router = useRouter();
  const { kind } = useLocalSearchParams<{ kind: "phone" | "email" }>();
  const email = kind === "email";
  const start = useStartLink();
  const finish = useFinishLink();
  const [value, setValue] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const send = () => {
    const id = email ? (isEmail(value) ? value.trim().toLowerCase() : null) : toE164Uganda(value);
    if (!id) return setError(email ? "Enter a valid email address" : "Enter a valid Ugandan mobile number, e.g. 0772 123456");
    setError(null);
    start.mutate(id, { onSuccess: () => setSentTo(id), onError: (e) => setError(errorMessage(e)) });
  };

  const confirm = () => {
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code");
    setError(null);
    finish.mutate({ identifier: sentTo!, otp: code }, { onSuccess: () => router.back(), onError: (e) => setError(errorMessage(e)) });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={[styles.screen, { flexGrow: 1 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title} accessibilityRole="header">{email ? "Add your email" : "Add your phone number"}</Text>
        {!sentTo ? (
          <>
            <Text style={styles.body}>
              {email
                ? "We'll email you a code to confirm it. Then you can sign in with your email too."
                : "We'll text you a code to confirm it. Then you can sign in with your phone too, and we'll text you order updates."}
            </Text>
            <Field
              label={email ? "Email" : "Mobile number"}
              value={value}
              onChangeText={setValue}
              placeholder={email ? "name@example.com" : "0772 123456"}
              keyboardType={email ? "email-address" : "phone-pad"}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={email ? "email" : "tel"}
              returnKeyType="send"
              onSubmitEditing={send}
              error={error}
              autoFocus
            />
            <Button title="Send code" onPress={send} loading={start.isPending} disabled={!value.trim()} />
          </>
        ) : (
          <>
            <Text style={styles.body}>We sent a 6-digit code to {sentTo}. It expires in 10 minutes.</Text>
            <Field
              label="Code"
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              returnKeyType="done"
              onSubmitEditing={confirm}
              error={error}
              autoFocus
            />
            <Button title="Confirm" onPress={confirm} loading={finish.isPending} disabled={code.length !== 6} />
            <Button title="Use a different one" variant="secondary" onPress={() => { setSentTo(null); setCode(""); setError(null); }} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
