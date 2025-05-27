import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Check } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Product } from "@shared/schema";

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const [isAdded, setIsAdded] = useState(false);
  const { toast } = useToast();

  const addToCartMutation = useMutation({
    mutationFn: async (productId: number) => {
      return apiRequest("POST", "/api/cart", {
        productId,
        quantity: 1,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      setIsAdded(true);
      setTimeout(() => setIsAdded(false), 2000);
      toast({
        title: "Added to cart",
        description: `${product.name} has been added to your cart`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add item to cart",
        variant: "destructive",
      });
    },
  });

  const handleAddToCart = () => {
    addToCartMutation.mutate(product.id);
  };

  const formatPrice = (price: string) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
    }).format(parseFloat(price));
  };

  return (
    <Card className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <div className="relative">
        <img
          src={product.image || "https://images.unsplash.com/photo-1542838132-92c53300491e?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300"}
          alt={product.name}
          className="w-full h-48 object-cover"
        />
        {!product.inStock && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <Badge variant="secondary" className="bg-white text-foreground">
              Out of Stock
            </Badge>
          </div>
        )}
      </div>
      <CardContent className="p-4">
        <h5 className="font-poppins font-medium text-foreground mb-1 line-clamp-1">
          {product.name}
        </h5>
        <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
          {product.description || "Fresh and quality product"}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-lg font-poppins font-semibold text-primary">
            {formatPrice(product.price)}
          </span>
          <Button
            size="sm"
            onClick={handleAddToCart}
            disabled={!product.inStock || addToCartMutation.isPending}
            className={`transition-all ${
              isAdded 
                ? "bg-green-600 hover:bg-green-700" 
                : "bg-primary hover:bg-primary/90"
            }`}
          >
            {isAdded ? (
              <>
                <Check className="mr-1" size={14} />
                Added
              </>
            ) : (
              <>
                <Plus className="mr-1" size={14} />
                Add
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
