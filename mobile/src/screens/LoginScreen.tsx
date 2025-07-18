import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Button, TextInput, Card, Title } from 'react-native-paper';
import { useAuth } from '../context/AuthContext';
import { showMessage } from 'react-native-flash-message';

export default function LoginScreen() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login, sendOTP } = useAuth();

  const handleSendOTP = async () => {
    if (!phoneNumber.trim()) {
      showMessage({
        message: 'Please enter your phone number',
        type: 'warning',
      });
      return;
    }

    setIsLoading(true);
    try {
      const success = await sendOTP(phoneNumber);
      if (success) {
        setOtpSent(true);
        showMessage({
          message: 'OTP sent successfully!',
          type: 'success',
        });
      } else {
        showMessage({
          message: 'Failed to send OTP. Please try again.',
          type: 'danger',
        });
      }
    } catch (error) {
      showMessage({
        message: 'Error sending OTP. Please try again.',
        type: 'danger',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp.trim()) {
      showMessage({
        message: 'Please enter the OTP',
        type: 'warning',
      });
      return;
    }

    setIsLoading(true);
    try {
      const success = await login(phoneNumber, otp);
      if (success) {
        showMessage({
          message: 'Login successful!',
          type: 'success',
        });
      } else {
        showMessage({
          message: 'Invalid OTP. Please try again.',
          type: 'danger',
        });
      }
    } catch (error) {
      showMessage({
        message: 'Login failed. Please try again.',
        type: 'danger',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToPhone = () => {
    setOtpSent(false);
    setOtp('');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          <Card style={styles.card}>
            <Card.Content>
              <Title style={styles.title}>
                {otpSent ? 'Verify OTP' : 'Login with Phone'}
              </Title>
              
              {!otpSent ? (
                <>
                  <TextInput
                    label="Phone Number"
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    keyboardType="phone-pad"
                    mode="outlined"
                    style={styles.input}
                    placeholder="+1234567890"
                  />
                  <Button
                    mode="contained"
                    onPress={handleSendOTP}
                    loading={isLoading}
                    disabled={isLoading}
                    style={styles.button}
                  >
                    Send OTP
                  </Button>
                </>
              ) : (
                <>
                  <Text style={styles.otpText}>
                    Enter the OTP sent to {phoneNumber}
                  </Text>
                  <TextInput
                    label="OTP"
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="numeric"
                    mode="outlined"
                    style={styles.input}
                    placeholder="123456"
                    maxLength={6}
                  />
                  <Button
                    mode="contained"
                    onPress={handleVerifyOTP}
                    loading={isLoading}
                    disabled={isLoading}
                    style={styles.button}
                  >
                    Verify OTP
                  </Button>
                  <Button
                    mode="outlined"
                    onPress={handleBackToPhone}
                    style={styles.secondaryButton}
                  >
                    Change Phone Number
                  </Button>
                </>
              )}
            </Card.Content>
          </Card>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    padding: 20,
    elevation: 4,
  },
  title: {
    textAlign: 'center',
    marginBottom: 20,
    fontSize: 24,
    fontWeight: 'bold',
  },
  input: {
    marginBottom: 15,
  },
  button: {
    marginTop: 10,
    padding: 5,
  },
  secondaryButton: {
    marginTop: 10,
  },
  otpText: {
    textAlign: 'center',
    marginBottom: 15,
    fontSize: 16,
    color: '#666',
  },
});