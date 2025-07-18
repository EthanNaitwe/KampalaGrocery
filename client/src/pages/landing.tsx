import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ShoppingBasket, Truck, Clock, Shield } from "lucide-react";
import PhoneAuth from "@/components/phone-auth";

export default function Landing() {
  const [showAuth, setShowAuth] = useState(false);

  const handleLogin = () => {
    setShowAuth(true);
  };

  if (showAuth) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <PhoneAuth />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold font-poppins text-primary">
                <ShoppingBasket className="inline mr-2" size={28} />
                FreshMart
              </h1>
            </div>
            <Button onClick={handleLogin} className="bg-primary hover:bg-primary/90">
              Sign In
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-r from-primary to-green-600 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-5xl font-bold font-poppins mb-6">
                Fresh Groceries Delivered to Your Door
              </h2>
              <p className="text-xl mb-8 opacity-90">
                Quality produce from Kampala's finest markets, delivered fresh daily to your neighborhood.
              </p>
              <Button 
                onClick={handleLogin}
                size="lg"
                className="bg-secondary hover:bg-secondary/90 text-white px-8 py-4 text-lg font-poppins font-semibold"
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

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h3 className="text-3xl font-bold font-poppins text-foreground mb-4">
              Why Choose FreshMart?
            </h3>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              We bring you the best grocery shopping experience with quality products and reliable service.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <Card className="text-center p-6 hover:shadow-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ShoppingBasket className="text-primary" size={32} />
                </div>
                <h4 className="font-poppins font-semibold text-lg mb-2">Fresh Products</h4>
                <p className="text-muted-foreground">
                  Locally sourced, fresh produce delivered daily from Kampala's best markets.
                </p>
              </CardContent>
            </Card>

            <Card className="text-center p-6 hover:shadow-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="w-16 h-16 bg-secondary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Truck className="text-secondary" size={32} />
                </div>
                <h4 className="font-poppins font-semibold text-lg mb-2">Fast Delivery</h4>
                <p className="text-muted-foreground">
                  Same-day delivery across Kampala with real-time tracking for your orders.
                </p>
              </CardContent>
            </Card>

            <Card className="text-center p-6 hover:shadow-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Clock className="text-primary" size={32} />
                </div>
                <h4 className="font-poppins font-semibold text-lg mb-2">24/7 Service</h4>
                <p className="text-muted-foreground">
                  Order anytime, anywhere. Our platform is available round the clock.
                </p>
              </CardContent>
            </Card>

            <Card className="text-center p-6 hover:shadow-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="text-accent" size={32} />
                </div>
                <h4 className="font-poppins font-semibold text-lg mb-2">Quality Guaranteed</h4>
                <p className="text-muted-foreground">
                  100% satisfaction guarantee with easy returns and customer support.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-muted">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h3 className="text-3xl font-bold font-poppins text-foreground mb-4">
            Ready to Start Shopping?
          </h3>
          <p className="text-lg text-muted-foreground mb-8">
            Join thousands of satisfied customers who trust FreshMart for their daily grocery needs.
          </p>
          <Button 
            onClick={handleLogin}
            size="lg"
            className="bg-primary hover:bg-primary/90 px-8 py-4 text-lg font-poppins font-semibold"
          >
            Get Started Now
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-foreground text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-xl font-poppins font-bold mb-4">
                <ShoppingBasket className="inline mr-2" size={24} />
                FreshMart
              </h3>
              <p className="text-gray-300 mb-4">
                Quality groceries delivered fresh from Kampala's finest markets to your doorstep.
              </p>
            </div>

            <div>
              <h4 className="font-poppins font-semibold mb-4">Quick Links</h4>
              <ul className="space-y-2 text-gray-300">
                <li>About Us</li>
                <li>Our Products</li>
                <li>Delivery Areas</li>
                <li>FAQ</li>
              </ul>
            </div>

            <div>
              <h4 className="font-poppins font-semibold mb-4">Customer Service</h4>
              <ul className="space-y-2 text-gray-300">
                <li>Contact Us</li>
                <li>Track Order</li>
                <li>Returns</li>
                <li>Support</li>
              </ul>
            </div>

            <div>
              <h4 className="font-poppins font-semibold mb-4">Contact Info</h4>
              <div className="space-y-2 text-gray-300">
                <p>Kampala, Uganda</p>
                <p>+256 700 123 456</p>
                <p>hello@freshmart.ug</p>
                <p>7 AM - 8 PM Daily</p>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-600 mt-8 pt-8 text-center text-gray-300">
            <p>&copy; 2024 FreshMart Kampala. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
