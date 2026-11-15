import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Text } from "react-native";
import { BrandMark } from "@/components/BrandMark";
import { Button, Field, Screen, styles } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { toE164Uganda } from "@/lib/phone";

export default function SignInScreen() {
  const router = useRouter();
  const { requestCode } = useAuth();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const e164 = toE164Uganda(phone);
    if (!e164) return setError("Enter a valid Ugandan mobile number, e.g. 0772 123456");
    setError(null);
    setLoading(true);
    try {
      await requestCode(e164);
      router.push({ pathname: "/verify", params: { phone: e164 } });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <BrandMark />
        <Text style={styles.title} accessibilityRole="header">Sign in to FreshMart</Text>
        <Text style={styles.body}>We'll text you a 6-digit code to confirm your number.</Text>
        <Field
          label="Mobile number"
          value={phone}
          onChangeText={setPhone}
          placeholder="0772 123456"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          returnKeyType="send"
          onSubmitEditing={submit}
          error={error}
          autoFocus
        />
        <Button title="Send code" onPress={submit} loading={loading} disabled={!phone.trim()} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
