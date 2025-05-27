import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShoppingBag, DollarSign, Users, Package } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Order, User } from "@shared/schema";

type OrderWithUser = Order & { user: User };

export default function Admin() {
  const { toast } = useToast();

  const { data: orders = [], isLoading: ordersLoading } = useQuery<OrderWithUser[]>({
    queryKey: ["/api/orders"],
  });

  const updateOrderMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: number; status: string }) => {
      return apiRequest("PUT", `/api/orders/${orderId}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Success",
        description: "Order status updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update order status",
        variant: "destructive",
      });
    },
  });

  const handleStatusUpdate = (orderId: number, status: string) => {
    updateOrderMutation.mutate({ orderId, status });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-secondary/10 text-secondary";
      case "confirmed":
        return "bg-blue-100 text-blue-800";
      case "preparing":
        return "bg-purple-100 text-purple-800";
      case "out_for_delivery":
        return "bg-orange-100 text-orange-800";
      case "delivered":
        return "bg-primary/10 text-primary";
      case "cancelled":
        return "bg-accent/10 text-accent";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatStatus = (status: string) => {
    return status.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
  };

  // Calculate stats
  const stats = {
    totalOrders: orders.length,
    totalRevenue: orders.reduce((sum, order) => sum + parseFloat(order.total || "0"), 0),
    uniqueCustomers: new Set(orders.map(order => order.userId)).size,
    pendingOrders: orders.filter(order => order.status === "pending").length,
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar showCart={false} />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-poppins font-bold text-foreground mb-2">Admin Dashboard</h2>
          <p className="text-muted-foreground">Manage orders, products, and customer inquiries</p>
        </div>

        {/* Dashboard Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <ShoppingBag className="text-primary" size={24} />
                </div>
                <div className="ml-4">
                  <h3 className="text-2xl font-poppins font-bold text-foreground">
                    {stats.totalOrders}
                  </h3>
                  <p className="text-sm text-muted-foreground">Total Orders</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-3 bg-secondary/10 rounded-lg">
                  <DollarSign className="text-secondary" size={24} />
                </div>
                <div className="ml-4">
                  <h3 className="text-2xl font-poppins font-bold text-foreground">
                    {new Intl.NumberFormat('en-UG', {
                      style: 'currency',
                      currency: 'UGX',
                      minimumFractionDigits: 0,
                    }).format(stats.totalRevenue)}
                  </h3>
                  <p className="text-sm text-muted-foreground">Revenue</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-3 bg-accent/10 rounded-lg">
                  <Users className="text-accent" size={24} />
                </div>
                <div className="ml-4">
                  <h3 className="text-2xl font-poppins font-bold text-foreground">
                    {stats.uniqueCustomers}
                  </h3>
                  <p className="text-sm text-muted-foreground">Customers</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <Package className="text-primary" size={24} />
                </div>
                <div className="ml-4">
                  <h3 className="text-2xl font-poppins font-bold text-foreground">
                    {stats.pendingOrders}
                  </h3>
                  <p className="text-sm text-muted-foreground">Pending Orders</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Orders Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-poppins font-semibold text-foreground">
              Recent Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ordersLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No orders found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow key={order.id} className="hover:bg-muted/50">
                        <TableCell className="font-medium">
                          #{order.id.toString().padStart(4, '0')}
                        </TableCell>
                        <TableCell>
                          {order.user?.firstName || order.user?.email || 'Unknown Customer'}
                        </TableCell>
                        <TableCell>
                          {new Intl.NumberFormat('en-UG', {
                            style: 'currency',
                            currency: 'UGX',
                            minimumFractionDigits: 0,
                          }).format(parseFloat(order.total || "0"))}
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(order.status || "pending")}>
                            {formatStatus(order.status || "pending")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(order.createdAt || "").toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={order.status || "pending"}
                            onValueChange={(value) => handleStatusUpdate(order.id, value)}
                            disabled={updateOrderMutation.isPending}
                          >
                            <SelectTrigger className="w-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="confirmed">Confirmed</SelectItem>
                              <SelectItem value="preparing">Preparing</SelectItem>
                              <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
                              <SelectItem value="delivered">Delivered</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
