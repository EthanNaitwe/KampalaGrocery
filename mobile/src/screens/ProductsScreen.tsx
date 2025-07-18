import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Card, Title, Paragraph, Searchbar, Chip } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useNavigation, useRoute } from '@react-navigation/native';
import { apiRequest } from '../utils/api';

const { width } = Dimensions.get('window');

interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  categoryId: number;
  imageUrl?: string;
}

interface Category {
  id: number;
  name: string;
  icon: string;
  description: string;
}

export default function ProductsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { categoryId } = route.params || {};
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(categoryId || null);

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const response = await apiRequest('/api/products');
      return response.json();
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const response = await apiRequest('/api/categories');
      return response.json();
    },
  });

  const filteredProducts = products.filter((product: Product) => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         product.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory ? product.categoryId === selectedCategory : true;
    return matchesSearch && matchesCategory;
  });

  const renderProduct = ({ item }: { item: Product }) => (
    <TouchableOpacity
      style={styles.productCard}
      onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
    >
      <Card style={styles.card}>
        <Card.Content>
          <Title style={styles.productName}>{item.name}</Title>
          <Paragraph style={styles.productDescription} numberOfLines={2}>
            {item.description}
          </Paragraph>
          <Text style={styles.productPrice}>${item.price.toFixed(2)}</Text>
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );

  const renderCategory = ({ item }: { item: Category }) => (
    <Chip
      style={[
        styles.categoryChip,
        selectedCategory === item.id && styles.selectedCategoryChip
      ]}
      textStyle={[
        styles.categoryChipText,
        selectedCategory === item.id && styles.selectedCategoryChipText
      ]}
      onPress={() => setSelectedCategory(selectedCategory === item.id ? null : item.id)}
    >
      {item.icon} {item.name}
    </Chip>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Title style={styles.headerTitle}>Products</Title>
        <Searchbar
          placeholder="Search products..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
        />
      </View>

      <View style={styles.filtersContainer}>
        <FlatList
          data={categories}
          renderItem={renderCategory}
          keyExtractor={(item) => item.id.toString()}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesList}
        />
      </View>

      <FlatList
        data={filteredProducts}
        renderItem={renderProduct}
        keyExtractor={(item) => item.id.toString()}
        numColumns={2}
        contentContainerStyle={styles.productsList}
        columnWrapperStyle={styles.row}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No products found</Text>
          </View>
        }
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
    marginBottom: 15,
  },
  searchBar: {
    elevation: 2,
  },
  filtersContainer: {
    backgroundColor: '#fff',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  categoriesList: {
    paddingHorizontal: 20,
  },
  categoryChip: {
    marginRight: 10,
    backgroundColor: '#f0f0f0',
  },
  selectedCategoryChip: {
    backgroundColor: '#007AFF',
  },
  categoryChipText: {
    color: '#333',
  },
  selectedCategoryChipText: {
    color: '#fff',
  },
  productsList: {
    padding: 10,
  },
  row: {
    justifyContent: 'space-between',
    paddingHorizontal: 5,
  },
  productCard: {
    width: (width - 30) / 2,
    marginBottom: 15,
  },
  card: {
    elevation: 2,
    height: 180,
  },
  productName: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  productDescription: {
    fontSize: 12,
    color: '#666',
    marginBottom: 10,
  },
  productPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 50,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
  },
});