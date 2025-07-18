import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Card, Title, Paragraph, Button, List, Divider } from 'react-native-paper';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const navigation = useNavigation();

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: logout,
        },
      ],
    );
  };

  const menuItems = [
    {
      title: 'My Orders',
      icon: 'receipt',
      onPress: () => navigation.navigate('Orders'),
    },
    {
      title: 'Shopping Cart',
      icon: 'shopping-cart',
      onPress: () => navigation.navigate('Cart'),
    },
    {
      title: 'Help & Support',
      icon: 'help-outline',
      onPress: () => {
        Alert.alert('Help & Support', 'Contact support at support@example.com');
      },
    },
    {
      title: 'Privacy Policy',
      icon: 'privacy-tip',
      onPress: () => {
        Alert.alert('Privacy Policy', 'View our privacy policy on our website.');
      },
    },
    {
      title: 'Terms of Service',
      icon: 'description',
      onPress: () => {
        Alert.alert('Terms of Service', 'View our terms of service on our website.');
      },
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Profile Header */}
        <Card style={styles.profileCard}>
          <Card.Content>
            <View style={styles.profileHeader}>
              <View style={styles.avatarContainer}>
                <Icon name="account-circle" size={64} color="#007AFF" />
              </View>
              <View style={styles.profileInfo}>
                <Title style={styles.profileName}>
                  {user?.phoneNumber || 'User'}
                </Title>
                <Paragraph style={styles.profileRole}>
                  {user?.isAdmin ? 'Admin' : 'Customer'}
                </Paragraph>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Account Info */}
        <Card style={styles.infoCard}>
          <Card.Content>
            <Title style={styles.sectionTitle}>Account Information</Title>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Phone Number:</Text>
              <Text style={styles.infoValue}>{user?.phoneNumber}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Account Type:</Text>
              <Text style={styles.infoValue}>
                {user?.isAdmin ? 'Administrator' : 'Customer'}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>User ID:</Text>
              <Text style={styles.infoValue}>{user?.id}</Text>
            </View>
          </Card.Content>
        </Card>

        {/* Menu Items */}
        <Card style={styles.menuCard}>
          <Card.Content>
            <Title style={styles.sectionTitle}>Menu</Title>
            {menuItems.map((item, index) => (
              <View key={index}>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={item.onPress}
                >
                  <View style={styles.menuItemLeft}>
                    <Icon name={item.icon} size={24} color="#666" />
                    <Text style={styles.menuItemText}>{item.title}</Text>
                  </View>
                  <Icon name="chevron-right" size={24} color="#666" />
                </TouchableOpacity>
                {index < menuItems.length - 1 && <Divider />}
              </View>
            ))}
          </Card.Content>
        </Card>

        {/* App Info */}
        <Card style={styles.infoCard}>
          <Card.Content>
            <Title style={styles.sectionTitle}>App Information</Title>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Version:</Text>
              <Text style={styles.infoValue}>1.0.0</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Build:</Text>
              <Text style={styles.infoValue}>001</Text>
            </View>
          </Card.Content>
        </Card>

        {/* Logout Button */}
        <View style={styles.logoutContainer}>
          <Button
            mode="contained"
            onPress={handleLogout}
            style={styles.logoutButton}
            contentStyle={styles.logoutButtonContent}
            buttonColor="#F44336"
          >
            Logout
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  profileCard: {
    margin: 20,
    marginBottom: 10,
    elevation: 4,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    marginRight: 20,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  profileRole: {
    fontSize: 14,
    color: '#666',
  },
  infoCard: {
    marginHorizontal: 20,
    marginBottom: 10,
    elevation: 2,
  },
  menuCard: {
    marginHorizontal: 20,
    marginBottom: 10,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    flex: 1,
    textAlign: 'right',
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuItemText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 15,
  },
  logoutContainer: {
    margin: 20,
  },
  logoutButton: {
    backgroundColor: '#F44336',
  },
  logoutButtonContent: {
    paddingVertical: 8,
  },
});