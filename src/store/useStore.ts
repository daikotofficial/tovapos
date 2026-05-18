import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Product {
  id: string
  name: string
  barcode: string
  price: number
  quantity: number
  category: string
  expiryDate: string
  batchNumber: string
  reorderLevel: number
  supplier: string
}

export interface CartItem {
  product: Product
  quantity: number
  discount?: number
}

export interface Sale {
  id: string
  items: CartItem[]
  total: number
  discount: number
  tax: number
  paymentMethod: 'cash' | 'card' | 'mobile'
  timestamp: string
  staffId: string
  customerPhone?: string
  notes?: string
}

export interface Customer {
  id: string
  name: string
  phone: string
  email?: string
  purchaseHistory: string[]
  totalSpent: number
  loyaltyPoints: number
  prescriptions?: Prescription[]
}

export interface Prescription {
  id: string
  customerId: string
  medications: string[]
  doctorName: string
  issueDate: string
  expiryDate: string
}

export interface User {
  id: string
  name: string
  role: 'cashier' | 'pharmacist' | 'admin'
  email: string
  phone: string
}

interface StoreState {
  // Products
  products: Product[]
  addProduct: (product: Product) => void
  updateProduct: (id: string, product: Partial<Product>) => void
  deleteProduct: (id: string) => void
  getProduct: (id: string) => Product | undefined
  
  // Cart
  cart: CartItem[]
  addToCart: (product: Product, quantity: number) => void
  removeFromCart: (productId: string) => void
  updateCartItem: (productId: string, quantity: number) => void
  clearCart: () => void
  
  // Sales
  sales: Sale[]
  addSale: (sale: Sale) => void
  getSalesByDate: (date: string) => Sale[]
  
  // Customers
  customers: Customer[]
  addCustomer: (customer: Customer) => void
  getCustomerByPhone: (phone: string) => Customer | undefined
  updateCustomer: (id: string, customer: Partial<Customer>) => void
  
  // Users
  users: User[]
  currentUser: User | null
  setCurrentUser: (user: User) => void
  addUser: (user: User) => void
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      // Products
      products: [],
      addProduct: (product) => set((state) => ({
        products: [...state.products, product]
      })),
      updateProduct: (id, updates) => set((state) => ({
        products: state.products.map((p) => p.id === id ? { ...p, ...updates } : p)
      })),
      deleteProduct: (id) => set((state) => ({
        products: state.products.filter((p) => p.id !== id)
      })),
      getProduct: (id) => get().products.find((p) => p.id === id),

      // Cart
      cart: [],
      addToCart: (product, quantity) => set((state) => {
        const existing = state.cart.find((item) => item.product.id === product.id)
        if (existing) {
          return {
            cart: state.cart.map((item) =>
              item.product.id === product.id
                ? { ...item, quantity: item.quantity + quantity }
                : item
            )
          }
        }
        return { cart: [...state.cart, { product, quantity }] }
      }),
      removeFromCart: (productId) => set((state) => ({
        cart: state.cart.filter((item) => item.product.id !== productId)
      })),
      updateCartItem: (productId, quantity) => set((state) => ({
        cart: quantity <= 0
          ? state.cart.filter((item) => item.product.id !== productId)
          : state.cart.map((item) =>
              item.product.id === productId ? { ...item, quantity } : item
            )
      })),
      clearCart: () => set({ cart: [] }),

      // Sales
      sales: [],
      addSale: (sale) => set((state) => ({
        sales: [...state.sales, sale]
      })),
      getSalesByDate: (date) => get().sales.filter((s) =>
        s.timestamp.startsWith(date)
      ),

      // Customers
      customers: [],
      addCustomer: (customer) => set((state) => ({
        customers: [...state.customers, customer]
      })),
      getCustomerByPhone: (phone) => get().customers.find((c) => c.phone === phone),
      updateCustomer: (id, updates) => set((state) => ({
        customers: state.customers.map((c) => c.id === id ? { ...c, ...updates } : c)
      })),

      // Users
      users: [],
      currentUser: null,
      setCurrentUser: (user) => set({ currentUser: user }),
      addUser: (user) => set((state) => ({
        users: [...state.users, user]
      }))
    }),
    { name: 'tovapos-store' }
  )
)
