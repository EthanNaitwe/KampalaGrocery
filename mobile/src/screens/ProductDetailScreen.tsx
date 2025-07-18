import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
} from 'react-native';
import { Card, Title, Paragraph, Button, IconButton } from 'react-native-paper';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRoute, useNavigation } from '@react-navigation/native';
import { showMessage } from 'react-native-flash-message';
import { apiRequest } from '../utils/api';

interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  categoryId: number;
  imageUrl?: string;
}

export default function ProductDetailScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { productId } = route.params;
  const queryClient = useQueryClient();
  
  const [quantity, setQuantity] = useState(1);

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', productId],
    queryFn: async () => {
      const response = await apiRequest(`/api/products/${productId}`);
      return response.json();
    },
  });

  const addToCartMutation = useMutation({
    mutationFn: async ({ productId, quantity }: { productId: number; quantity: number }) => {
      const response = await apiRequest('/api/cart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ productId, quantity }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to add to cart');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      showMessage({
        message: 'Product added to cart!',
        type: 'success',
      });
    },
    onError: () => {
      showMessage({
        message: 'Failed to add to cart. Please try again.',
        type: 'danger',
      });
    },
  });

  const handleAddToCart = () => {
    if (product) {
      addToCartMutation.mutate({ productId: product.id, quantity });
    }
  };

  const adjustQuantity = (delta: number) => {
    setQuantity(Math.max(1, quantity + delta));
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!product) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Product not found</Text>
          <Button onPress={() => navigation.goBack()}>Go Back</Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <Card style={styles.productCard}>
          <Card.Content>
            <Title style={styles.productName}>{product.name}</Title>
            <Paragraph style={styles.productDescription}>
              {product.description}
            </Paragraph>
            <Text style={styles.productPrice}>${product.price.toFixed(2)}</Text>
          </Card.Content>
        </Card>

        <Card style={styles.quantityCard}>
          <Card.Content>
            <Title style={styles.sectionTitle}>Quantity</Title>
            <View style={styles.quantityContainer}>
              <IconButton
                icon="minus"
                size={24}
                onPress={() => adjustQuantity(-1)}
                disabled={quantity <= 1}
              />
              <Text style={styles.quantityText}>{quantity}</Text>
              <IconButton
                icon="plus"
                size={24}
                onPress={() => adjustQuantity(1)}
              />
            </View>
          </Card.Content>
        </Card>

        <Card style={styles.totalCard}>
          <Card.Content>
            <View style={styles.totalContainer}>
              <Text style={styles.totalLabel}>Total:</Text>
              <Text style={styles.totalAmount}>
                ${(product.price * quantity).toFixed(2)}
              </Text>
            </View>
          </Card.Content>
        </Card>
      </ScrollView>

      <View style={styles.bottomContainer}>
        <Button
          mode="contained"
          onPress={handleAddToCart}
          loading={addToCartMutation.isPending}
          disabled={addToCartMutation.isPending}
          style={styles.addToCartButton}
          contentStyle={styles.buttonContent}
        >
          Add to Cart
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
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  productCard: {
    margin: 20,
    elevation: 4,
  },
  productName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  productDescription: {
    fontSize: 16,
    color: '#666',
    marginBottom: 15,
    lineHeight: 24,
  },
  productPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  quantityCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginHorizontal: 20,
    minWidth: 30,
    textAlign: 'center',
  },
  totalCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    elevation: 2,
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  totalAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  bottomContainer: {
    padding: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  addToCartButton: {
    backgroundColor: '#007AFF',
  },
  buttonContent: {
    paddingVertical: 8,
  },
});