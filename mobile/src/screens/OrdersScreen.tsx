import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
} from 'react-native';
import { Card, Title, Paragraph, Chip } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { apiRequest } from '../utils/api';

interface OrderItem {
  id: number;
  productId: number;
  quantity: number;
  price: number;
  product: {
    id: number;
    name: string;
    description: string;
    price: number;
  };
}

interface Order {
  id: number;
  userId: string;
  total: number;
  status: string;
  createdAt: string;
  items: OrderItem[];
}

export default function OrdersScreen() {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const response = await apiRequest('/api/orders');
      return response.json();
    },
  });

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending':
        return '#FFA500';
      case 'confirmed':
        return '#007AFF';
      case 'shipped':
        return '#4CAF50';
      case 'delivered':
        return '#2E7D32';
      case 'cancelled':
        return '#F44336';
      default:
        return '#666';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderOrderItem = ({ item }: { item: OrderItem }) => (
    <View style={styles.orderItem}>
      <View style={styles.orderItemHeader}>
        <Text style={styles.orderItemName}>{item.product.name}</Text>
        <Text style={styles.orderItemQuantity}>x{item.quantity}</Text>
      </View>
      <Text style={styles.orderItemPrice}>${item.price.toFixed(2)}</Text>
    </View>
  );

  const renderOrder = ({ item }: { item: Order }) => (
    <Card style={styles.orderCard}>
      <Card.Content>
        <View style={styles.orderHeader}>
          <Title style={styles.orderTitle}>Order #{item.id}</Title>
          <Chip
            style={[styles.statusChip, { backgroundColor: getStatusColor(item.status) }]}
            textStyle={styles.statusText}
          >
            {item.status.toUpperCase()}
          </Chip>
        </View>
        
        <Text style={styles.orderDate}>{formatDate(item.createdAt)}</Text>
        
        <View style={styles.orderItems}>
          <FlatList
            data={item.items}
            renderItem={renderOrderItem}
            keyExtractor={(orderItem) => orderItem.id.toString()}
            scrollEnabled={false}
          />
        </View>
        
        <View style={styles.orderFooter}>
          <Text style={styles.orderTotal}>Total: ${item.total.toFixed(2)}</Text>
        </View>
      </Card.Content>
    </Card>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text>Loading orders...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (orders.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Icon name="receipt" size={64} color="#ccc" />
          <Text style={styles.emptyText}>No orders yet</Text>
          <Text style={styles.emptySubtext}>
            Your order history will appear here
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Title style={styles.headerTitle}>My Orders</Title>
        <Text style={styles.orderCount}>
          {orders.length} {orders.length === 1 ? 'order' : 'orders'}
        </Text>
      </View>

      <FlatList
        data={orders}
        renderItem={renderOrder}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.ordersList}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  orderCount: {
    fontSize: 16,
    color: '#666',
    marginTop: 5,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    marginTop: 20,
    marginBottom: 10,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  ordersList: {
    padding: 20,
  },
  orderCard: {
    marginBottom: 15,
    elevation: 2,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  orderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  statusChip: {
    paddingHorizontal: 8,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  orderDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 15,
  },
  orderItems: {
    marginBottom: 15,
  },
  orderItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  orderItemHeader: {
    flex: 1,
  },
  orderItemName: {
    fontSize: 14,
    fontWeight: '500',
  },
  orderItemQuantity: {
    fontSize: 12,
    color: '#666',
  },
  orderItemPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  orderFooter: {
    alignItems: 'flex-end',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  orderTotal: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
});