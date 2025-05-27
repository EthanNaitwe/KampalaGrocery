import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/navbar";
import { ProductCard } from "@/components/product-card";
import { ShoppingCart } from "@/components/shopping-cart";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Filter } from "lucide-react";
import type { Product, Category } from "@shared/schema";

export default function Home() {
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCartOpen, setIsCartOpen] = useState(false);

  const { data: categories = [], isLoading: categoriesLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/products", selectedCategory, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory) params.set("categoryId", selectedCategory.toString());
      if (searchQuery) params.set("search", searchQuery);
      
      const response = await fetch(`/api/products?${params}`);
      if (!response.ok) throw new Error("Failed to fetch products");
      return response.json();
    },
  });

  const categoryIcons = {
    "Fruits": "🍎",
    "Vegetables": "🥕", 
    "Meat & Fish": "🐟",
    "Dairy": "🧀",
    "Bakery": "🍞",
    "Beverages": "🥤",
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar onCartClick={() => setIsCartOpen(true)} />
      
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-primary to-green-600 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <h2 className="text-4xl font-bold font-poppins mb-4">
                Fresh Groceries Delivered to Your Door
              </h2>
              <p className="text-xl mb-6 opacity-90">
                Quality produce from Kampala's finest markets, delivered fresh daily to your neighborhood.
              </p>
              <Button 
                size="lg"
                className="bg-secondary hover:bg-secondary/90 text-white px-8 py-3 font-poppins font-semibold"
              >
                Start Shopping
              </Button>
            </div>
            <div className="relative">
              <img
                src="https://images.unsplash.com/photo-1542838132-92c53300491e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600"
                alt="Fresh groceries and produce"
                className="rounded-xl shadow-lg w-full h-auto"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Categories Section */}
      <section className="bg-white py-6 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-poppins font-semibold text-foreground">Shop by Category</h3>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setSelectedCategory(null)}
              className="text-primary hover:text-primary/80"
            >
              View All
            </Button>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
            {categoriesLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="text-center p-4">
                  <Skeleton className="w-12 h-12 rounded-full mx-auto mb-2" />
                  <Skeleton className="h-4 w-16 mx-auto" />
                </div>
              ))
            ) : (
              categories.map((category) => (
                <div
                  key={category.id}
                  className={`text-center p-4 rounded-lg hover:bg-background transition-colors cursor-pointer ${
                    selectedCategory === category.id ? "bg-primary/10" : ""
                  }`}
                  onClick={() => setSelectedCategory(
                    selectedCategory === category.id ? null : category.id
                  )}
                >
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2">
                    <span className="text-2xl">
                      {categoryIcons[category.name as keyof typeof categoryIcons] || "📦"}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-foreground">{category.name}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar Filters */}
          <aside className="lg:w-64 flex-shrink-0">
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h4 className="font-poppins font-semibold text-foreground mb-4 flex items-center gap-2">
                <Filter size={16} />
                Search & Filter
              </h4>
              
              {/* Search */}
              <div className="mb-6">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search products..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Active Filters */}
              {(selectedCategory || searchQuery) && (
                <div className="mb-6">
                  <h5 className="text-sm font-medium text-foreground mb-2">Active Filters</h5>
                  <div className="space-y-2">
                    {selectedCategory && (
                      <Badge 
                        variant="secondary" 
                        className="cursor-pointer"
                        onClick={() => setSelectedCategory(null)}
                      >
                        {categories.find(c => c.id === selectedCategory)?.name} ×
                      </Badge>
                    )}
                    {searchQuery && (
                      <Badge 
                        variant="secondary" 
                        className="cursor-pointer"
                        onClick={() => setSearchQuery("")}
                      >
                        "{searchQuery}" ×
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </div>
          </aside>

          {/* Product Grid */}
          <div className="flex-1">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-poppins font-semibold text-foreground">
                {selectedCategory 
                  ? `${categories.find(c => c.id === selectedCategory)?.name} Products`
                  : searchQuery 
                    ? `Search Results for "${searchQuery}"`
                    : "Featured Products"
                }
              </h3>
              <p className="text-muted-foreground">
                {products.length} product{products.length !== 1 ? 's' : ''} found
              </p>
            </div>

            {productsLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="bg-white rounded-lg shadow-sm overflow-hidden">
                    <Skeleton className="w-full h-48" />
                    <div className="p-4">
                      <Skeleton className="h-6 w-3/4 mb-2" />
                      <Skeleton className="h-4 w-full mb-2" />
                      <div className="flex items-center justify-between">
                        <Skeleton className="h-6 w-20" />
                        <Skeleton className="h-8 w-16" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground text-lg">
                  {searchQuery || selectedCategory 
                    ? "No products found matching your criteria."
                    : "No products available at the moment."
                  }
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <ShoppingCart isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </div>
  );
}
