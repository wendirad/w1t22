import { createContext, useContext, useState, ReactNode } from 'react';

interface CartItem {
  vehicleId: string;
  vehicle?: any;
  addOnServices: Array<{ serviceCode: string; name: string; price: number }>;
}

interface CartContextType {
  items: CartItem[];
  itemCount: number;
  setItems: (items: CartItem[]) => void;
  clearItems: () => void;
}

const CartContext = createContext<CartContextType | null>(null);

export function useCartContext() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCartContext must be used within CartProvider');
  return ctx;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  return (
    <CartContext.Provider
      value={{
        items,
        itemCount: items.length,
        setItems,
        clearItems: () => setItems([]),
      }}
    >
      {children}
    </CartContext.Provider>
  );
}
