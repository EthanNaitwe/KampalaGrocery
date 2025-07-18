import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { Card, Title, Paragraph, Button, IconButton } from 'react-native-paper';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { showMessage } from 'react-native-flash-message';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { apiRequest } from '../utils/api';

interface CartItem {
  id: number;
  productId: number;
  quantity: number;
  product: {
    id: number;
    name: string;
    description: string;
    price: number;
  };
}

export default function CartScreen() {
  const navigation = useNavigation();
  const queryClient = useQueryClient();

  const { data: cartItems = [], isLoading } = useQuery({
    queryKey: ['cart'],
    queryFn: async () => {
      const response = await apiRequest('/api/cart');
      return response.json();
    },
  });

  const updateQuantityMutation = useMutation({
    mutationFn: async ({ itemId, quantity }: { itemId: number; quantity: number }) => {
      const response = await apiRequest(`/api/cart/${itemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ quantity }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update quantity');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
    },
    onError: () => {
      showMessage({
        message: 'Failed to update quantity. Please try again.',
        type: 'danger',
      });
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: async (itemId: number) => {
      const response = await apiRequest(`/api/cart/${itemId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to remove item');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      showMessage({
        message: 'Item removed from cart',
        type: 'success',
      });
    },
    onError: () => {
      showMessage({
        message: 'Failed to remove item. Please try again.',
        type: 'danger',
      });
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: cartItems.map((item: CartItem) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to place order');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      showMessage({
        message: 'Order placed successfully!',
        type: 'success',
      });
      navigation.navigate('Orders');
    },
    onError: () => {
      showMessage({
        message: 'Failed to place order. Please try again.',
        type: 'danger',
      });
    },
  });

  const updateQuantity = (itemId: number, newQuantity: number) => {
    if (newQuantity < 1) {
      removeItemMutation.mutate(itemId);
    } else {
      updateQuantityMutation.mutate({ itemId, quantity: newQuantity });
    }
  };

  const getTotalPrice = () => {
    return cartItems.reduce((total: number, item: CartItem) => {
      return total + (item.product.price * item.quantity);
    }, 0);
  };

  const getTotalItems = () => {
    return cartItems.reduce((total: number, item: CartItem) => {
      return total + item.quantity;
    }, 0);
  };

  const renderCartItem = ({ item }: { item: CartItem }) => (
    <Card style={styles.cartItem}>
      <Card.Content>
        <View style={styles.itemHeader}>
          <Title style={styles.itemName}>{item.product.name}</Title>
          <TouchableOpacity
            onPress={() => removeItemMutation.mutate(item.id)}
            style={styles.removeButton}
          >
            <Icon name="close" size={20} color="#666" />
          </TouchableOpacity>
        </View>
        <Paragraph style={styles.itemDescription} numberOfLines={2}>
          {item.product.description}
        </Paragraph>
        <View style={styles.itemFooter}>
          <Text style={styles.itemPrice}>${item.product.price.toFixed(2)}</Text>
          <View style={styles.quantityContainer}>
            <IconButton
              icon="minus"
              size={20}
              onPress={() => updateQuantity(item.id, item.quantity - 1)}
              disabled={updateQuantityMutation.isPending}
            />
            <Text style={styles.quantityText}>{item.quantity}</Text>
            <IconButton
              icon="plus"
              size={20}
              onPress={() => updateQuantity(item.id, item.quantity + 1)}
              disabled={updateQuantityMutation.isPending}
            />
          </View>
        </View>
        <View style={styles.itemTotal}>
          <Text style={styles.itemTotalText}>
            Total: ${(item.product.price * item.quantity).toFixed(2)}
          </Text>
        </View>
      </Card.Content>
    </Card>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text>Loading cart...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (cartItems.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Icon name="shopping-cart" size={64} color="#ccc" />
          <Text style={styles.emptyText}>Your cart is empty</Text>
          <Button
            mode="contained"
            onPress={() => navigation.navigate('Products')}
            style={styles.shopButton}
          >
            Start Shopping
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Title style={styles.headerTitle}>Shopping Cart</Title>
        <Text style={styles.itemCount}>
          {getTotalItems()} {getTotalItems() === 1 ? 'item' : 'items'}
        </Text>
      </View>

      <FlatList
        data={cartItems}
        renderItem={renderCartItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.cartList}
      />

      <View style={styles.bottomContainer}>
        <View style={styles.totalContainer}>
          <Text style={styles.totalLabel}>Total:</Text>
          <Text style={styles.totalAmount}>${getTotalPrice().toFixed(2)}</Text>
        </View>
        <Button
          mode="contained"
          onPress={() => checkoutMutation.mutate()}
          loading={checkoutMutation.isPending}
          disabled={checkoutMutation.isPending}
          style={styles.checkoutButton}
          contentStyle={styles.buttonContent}
        >
          Checkout
        </Button>
      </View>
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
  itemCount: {
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
    marginBottom: 30,
  },
  shopButton: {
    backgroundColor: '#007AFF',
  },
  cartList: {
    padding: 20,
  },
  cartItem: {
    marginBottom: 15,
    elevation: 2,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 5,
  },
  itemName: {
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
  },
  removeButton: {
    padding: 5,
  },
  itemDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 10,
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quantityText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginHorizontal: 10,
    minWidth: 20,
    textAlign: 'center',
  },
  itemTotal: {
    alignItems: 'flex-end',
    marginTop: 10,
  },
  itemTotalText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  bottomContainer: {
    padding: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  totalLabel: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  checkoutButton: {
    backgroundColor: '#007AFF',
  },
  buttonContent: {
    paddingVertical: 8,
  },
});