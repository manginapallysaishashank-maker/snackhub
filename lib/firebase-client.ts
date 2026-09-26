'use client'

import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyCz4WgizSI37Q2GvieccWV2cdUaW_3gtqY',
  authDomain: 'snackhub-a22fe.firebaseapp.com',
  projectId: 'snackhub-a22fe',
  storageBucket: 'snackhub-a22fe.firebasestorage.app',
  messagingSenderId: '348879973270',
  appId: '1:348879973270:web:d48521cf59579889220bb7',
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export { app }

export async function adminFetch<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Something went wrong. Please try again.')
  return body as T
}

export type SnackCategory = 'sugary' | 'hot' | 'beverages' | 'chips' | 'biscuits'
export type Product = { id: string; name: string; price: number; image: string; category: SnackCategory; stock: number }
export type StoreOrder = {
  id: string
  room: string
  name: string
  items: { name: string; qty: number; price: number }[]
  total: number
  payment: 'cash' | 'online'
  time: string
  createdAt: number
  status: 'pending' | 'preparing' | 'delivered' | 'cancelled'
}
export type StoreSettings = { open: boolean }
export const categories: { id: SnackCategory; title: string; eyebrow: string }[] = [
  { id: 'sugary', title: 'Sugary Items', eyebrow: 'Something sweet' },
  { id: 'hot', title: 'Hot Snacks', eyebrow: 'Fresh & filling' },
  { id: 'beverages', title: 'Beverages', eyebrow: 'Sip something' },
  { id: 'chips', title: 'Chips', eyebrow: 'Crunch time' },
  { id: 'biscuits', title: 'Biscuits', eyebrow: 'Tea-time favorites' },
]

export function formatRupees(value: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value)
}

export function imageUrl(value: string) {
  return /^https:\/\//i.test(value) ? value : ''
}

export function categoryLabel(category: string) {
  return categories.find((item) => item.id === category)?.title ?? 'Snacks'
}

export function formatOrderTime(value: number | string) {
  const date = typeof value === 'number' ? new Date(value) : new Date(value)
  return Number.isNaN(date.getTime()) ? 'Just now' : new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export async function publicFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Unable to load SnackHub right now.')
  return body as T
}

export async function userToken() {
  if (!auth.currentUser) throw new Error('Please sign in again.')
  return auth.currentUser.getIdToken()
}

export function getFriendlyError(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

export function buildOrderPayload(room: string, name: string, payment: 'cash' | 'online', items: { id: string; qty: number }[]) {
  return { room: room.trim(), name: name.trim(), payment, items }
}

export function iconForCategory(category: SnackCategory) {
  return ({ sugary: '✳', hot: '◒', beverages: '◉', chips: '✺', biscuits: '◌' })[category]
}

export function validateImageUrl(value: string) {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export function categoryFor(product: Product) {
  return categories.find((category) => category.id === product.category)
}

export function orderTotal(items: { price: number; qty: number }[]) {
  return items.reduce((sum, item) => sum + item.price * item.qty, 0)
}

export function sortNewest<T extends { createdAt?: number }>(items: T[]) {
  return [...items].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
}

export function asErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'An unexpected error occurred.'
}

export function isAdminStatus(value: unknown): value is { admin: true } {
  return Boolean(value && typeof value === 'object' && 'admin' in value && value.admin === true)
}

export function paymentLabel(value: string) {
  return value === 'online' ? 'Online' : 'Cash'
}

export function orderStatusLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export const orderStatuses = ['pending', 'preparing', 'delivered', 'cancelled'] as const
export type OrderStatus = (typeof orderStatuses)[number]

export function isOrderStatus(value: string): value is OrderStatus {
  return (orderStatuses as readonly string[]).includes(value)
}

export function safeText(value: unknown, maxLength = 120) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

export function numericValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function isSnackCategory(value: unknown): value is SnackCategory {
  return typeof value === 'string' && categories.some((category) => category.id === value)
}

export function isPaymentMethod(value: unknown): value is 'cash' | 'online' {
  return value === 'cash' || value === 'online'
}

export function itemCount(items: { qty: number }[]) {
  return items.reduce((sum, item) => sum + item.qty, 0)
}

export function safeProductImage(value: string) {
  return imageUrl(value) || ''
}

export function emptyStoreSettings(): StoreSettings {
  return { open: true }
}

export function safeOrderItems(value: unknown): StoreOrder['items'] {
  if (!Array.isArray(value)) return []
  return value.filter((item) => item && typeof item.name === 'string').map((item) => ({
    name: safeText(item.name, 100), qty: numericValue(item.qty), price: numericValue(item.price),
  }))
}

export function apiErrorMessage(error: unknown) {
  return getFriendlyError(error)
}

export function roleLabel(admin: boolean) {
  return admin ? 'Store administrator' : 'Team member'
}

export function storeStatusLabel(open: boolean) {
  return open ? 'Store open' : 'Store closed'
}

export function getCategoryAccent(category: SnackCategory) {
  return ({ sugary: 'lavender', hot: 'coral', beverages: 'blue', chips: 'amber', biscuits: 'mint' })[category]
}

export function safeQuantity(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0
}

export function canAddQuantity(product: Product, currentQty: number) {
  return product.stock > currentQty
}

export function orderLineTotal(item: { price: number; qty: number }) {
  return item.price * item.qty
}

export function cartQuantity(items: { qty: number }[]) {
  return itemCount(items)
}

export function safeRoom(value: string) {
  return value.trim().slice(0, 30)
}

export function safeCustomerName(value: string) {
  return value.trim().slice(0, 80)
}

export function friendlyStock(stock: number) {
  if (stock <= 0) return 'Sold out'
  if (stock < 5) return `${stock} left`
  return 'In stock'
}

export function compactCurrency(value: number) {
  return `₹${formatRupees(value)}`
}

export function productSearchText(product: Product) {
  return `${product.name} ${categoryLabel(product.category)}`.toLowerCase()
}

export function getOrderStatusTone(status: string) {
  return status === 'delivered' ? 'success' : status === 'cancelled' ? 'muted' : status === 'preparing' ? 'info' : 'warning'
}

export function groupProducts(products: Product[]) {
  return categories.map((category) => ({ ...category, products: products.filter((product) => product.category === category.id && product.stock > 0) })).filter((category) => category.products.length > 0)
}

export function isStoreOpen(settings?: StoreSettings) {
  return settings?.open !== false
}

export function stockSummary(products: Product[]) {
  return products.reduce((sum, product) => sum + product.stock, 0)
}

export function productCountLabel(count: number) {
  return `${count} ${count === 1 ? 'item' : 'items'}`
}

export function trimProductName(value: string) {
  return value.trim().slice(0, 80)
}

export function productPrice(value: string) {
  return Number.parseInt(value, 10)
}

export function productStock(value: string) {
  return Number.parseInt(value, 10)
}

export function formatCount(value: number) {
  return new Intl.NumberFormat('en-IN').format(value)
}

export function orderIdLabel(id: string) {
  return id.slice(-6).toUpperCase()
}

export function orderCreatedAt(order: StoreOrder) {
  return order.createdAt || Date.now()
}

export function itemImageAlt(name: string) {
  return `${name} package`
}

export function getDefaultOrderStatus(): OrderStatus {
  return 'pending'
}

export function hasItems<T>(items: T[] | undefined): items is T[] {
  return Boolean(items && items.length > 0)
}

export function stringifyError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function formatRoom(room: string) {
  return `Room ${room}`
}

export function noOp() {}

export function isValidQuantity(value: number) {
  return Number.isInteger(value) && value > 0 && value <= 50
}

export function productImageClass() {
  return 'object-contain'
}

export function getCategoryName(category: SnackCategory) {
  return categoryLabel(category)
}

export function currentTimestamp() {
  return Date.now()
}

export function isNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
}

export function isPositiveInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

export function safeOrderName(name: string) {
  return name.trim() || 'Guest'
}

export function getCurrency() {
  return 'INR'
}

export function productCategoryColor(category: SnackCategory) {
  return getCategoryAccent(category)
}

export function quantityText(value: number) {
  return `${value} ${value === 1 ? 'piece' : 'pieces'}`
}

export function fallbackImageLabel() {
  return 'Image unavailable'
}

export function getOrderPaymentMethod(order: StoreOrder) {
  return paymentLabel(order.payment)
}

export function sortByName(products: Product[]) {
  return [...products].sort((a, b) => a.name.localeCompare(b.name))
}

export function validProductPrice(value: number) {
  return Number.isInteger(value) && value > 0 && value <= 100000
}

export function validProductStock(value: number) {
  return Number.isInteger(value) && value >= 0 && value <= 100000
}

export function formatCategoryHeading(category: SnackCategory) {
  return categories.find((item) => item.id === category)?.title ?? 'Menu'
}

export function formatCartCount(value: number) {
  return value > 99 ? '99+' : String(value)
}

export function focusableError(error: unknown) {
  return apiErrorMessage(error)
}

export function hasValidImage(value: string) {
  return validateImageUrl(value)
}

export function categoryIds() {
  return categories.map((category) => category.id)
}

export function minStockLabel(stock: number) {
  return stock < 5 ? 'Low stock' : 'Available'
}

export function dateSortValue(value: number) {
  return Number.isFinite(value) ? value : 0
}

export function imageLoading() {
  return 'lazy' as const
}

export function imageDecoding() {
  return 'async' as const
}

export function checkoutError(error: unknown) {
  return apiErrorMessage(error)
}

export function isNotEmpty(value: string) {
  return value.trim().length > 0
}

export function validOrderRoom(value: string) {
  return value.trim().length > 0 && value.trim().length <= 30
}

export function getStoreHoursLabel() {
  return 'Open while the store is accepting orders'
}

export function safeStatus(value: string) {
  return isOrderStatus(value) ? value : 'pending'
}

export function cleanOrderNote(value: string) {
  return value.trim().slice(0, 200)
}

export function updateProductStock(product: Product, stock: number): Product {
  return { ...product, stock }
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function formatStock(stock: number) {
  return `${stock} in stock`
}

export function safePayment(value: string): 'cash' | 'online' {
  return value === 'online' ? 'online' : 'cash'
}

export function statusOptions() {
  return orderStatuses.map((status) => ({ value: status, label: orderStatusLabel(status) }))
}

export function productPlaceholder(name: string) {
  return name.slice(0, 1).toUpperCase()
}

export function isHttpUrl(value: string) {
  return /^https:\/\//i.test(value)
}

export function shouldShowLowStock(stock: number) {
  return stock > 0 && stock < 5
}

export function safeCount(value: number) {
  return Math.max(0, Math.floor(value))
}

export function getOrderTotal(order: StoreOrder) {
  return numericValue(order.total)
}

export function emptyProducts(): Product[] {
  return []
}

export function emptyOrders(): StoreOrder[] {
  return []
}

export function deliveryLabel() {
  return 'Delivered to your hostel room'
}

export function storeBrand() {
  return 'SnackHub'
}

export function getOrderStatusMessage(status: string) {
  return status === 'delivered' ? 'Delivered' : status === 'cancelled' ? 'Cancelled' : status === 'preparing' ? 'Being prepared' : 'New order'
}

export function sortOrders(orders: StoreOrder[]) {
  return sortNewest(orders)
}

export function productPriceLabel(price: number) {
  return `₹${formatRupees(price)}`
}

export function productStockLabel(stock: number) {
  return stock > 0 ? `${stock} left` : 'Out of stock'
}

export function canOrder(settings: StoreSettings | undefined, product: Product) {
  return isStoreOpen(settings) && product.stock > 0
}

export function isGuestName(value: string) {
  return value.trim().length === 0
}

export function productDescription(category: SnackCategory) {
  return categories.find((item) => item.id === category)?.eyebrow ?? ''
}

export function cartItemKey(id: string) {
  return id
}

export function isProduct(value: unknown): value is Product {
  return Boolean(value && typeof value === 'object' && 'id' in value && 'name' in value && 'price' in value)
}

export function makeCategoryPath(category: SnackCategory) {
  return `#${category}`
}

export function productInputError() {
  return 'Please check the product details and try again.'
}

export function defaultCustomerName() {
  return 'Guest'
}

export function formatOrderCount(count: number) {
  return `${count} orders`
}

export function totalRevenue(orders: StoreOrder[]) {
  return orders.filter((order) => order.status !== 'cancelled').reduce((sum, order) => sum + order.total, 0)
}

export function pendingOrderCount(orders: StoreOrder[]) {
  return orders.filter((order) => order.status === 'pending').length
}

export function openOrderCount(orders: StoreOrder[]) {
  return orders.filter((order) => order.status === 'pending' || order.status === 'preparing').length
}

export function productAvailability(stock: number) {
  return stock > 0
}

export function statusClass(status: string) {
  return `status-${status}`
}

export function safeImageUrl(value: string) {
  return validateImageUrl(value) ? value : ''
}

export function maximumOrderLines() {
  return 20
}

export function maximumOrderQuantity() {
  return 50
}

export function minimumRoomLength() {
  return 1
}

export function maximumRoomLength() {
  return 30
}

export function maximumCustomerNameLength() {
  return 80
}

export function currencySymbol() {
  return '₹'
}

export function orderTimeText(order: StoreOrder) {
  return formatOrderTime(order.createdAt || order.time)
}

export function formatItemQuantity(quantity: number) {
  return `×${quantity}`
}

export function productStockTone(stock: number) {
  return stock === 0 ? 'empty' : stock < 5 ? 'low' : 'available'
}

export function storeStateText(open: boolean) {
  return open ? 'Accepting orders' : 'Not accepting orders'
}

export function orderPaymentText(payment: 'cash' | 'online') {
  return payment === 'cash' ? 'Cash on delivery' : 'Online payment'
}

export function makeProductSummary(product: Product) {
  return `${categoryLabel(product.category)} · ${product.stock} in stock`
}

export function isOrderOpen(status: string) {
  return status === 'pending' || status === 'preparing'
}

export function createOrderTimeLabel(createdAt: number) {
  return formatOrderTime(createdAt)
}

export function getNavigationCategories() {
  return categories
}

export function getProductCategories() {
  return categories
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function currencyFormat(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)
}

export function onlyPositive(value: number) {
  return Math.max(0, value)
}

export function getItemWord(count: number) {
  return count === 1 ? 'item' : 'items'
}

export function getStatusText(status: string) {
  return orderStatusLabel(status)
}

export function toProductList(value: unknown): Product[] {
  return Array.isArray(value) ? value.filter(isProduct) : []
}

export function getStatusOptions() {
  return orderStatuses
}

export function getCategoryProducts(products: Product[], category: SnackCategory) {
  return products.filter((product) => product.category === category)
}

export function getProductName(name: string) {
  return safeText(name, 80)
}

export function getRoomNumber(room: string) {
  return safeRoom(room)
}

export function getOrderItemsCount(order: StoreOrder) {
  return itemCount(order.items)
}

export function canCheckout(cart: { qty: number }[], room: string) {
  return cart.length > 0 && validOrderRoom(room)
}

export function welcomeHeading() {
  return 'Midnight cravings? Sorted.'
}

export function menuDescription() {
  return 'Quick bites delivered to your hostel room.'
}

export function getStoreClosedMessage() {
  return 'The store is currently closed, so new orders are paused.'
}

export function getEmptyMenuMessage() {
  return 'No snacks are listed just yet. Check back soon.'
}

export function getOrderSuccessMessage() {
  return 'Your order is in. The team will bring it to your room.'
}

export function getPaymentMethods() {
  return ['cash', 'online'] as const
}

export function currentCurrency() {
  return '₹'
}

export function safeStatusClass(status: string) {
  return statusClass(safeStatus(status))
}

export function getCheckoutLabel(count: number) {
  return `Place order · ${count} ${getItemWord(count)}`
}

export function isExternalImageUrl(value: string) {
  return validateImageUrl(value)
}

export function formatProductCount(count: number) {
  return count.toString().padStart(2, '0')
}

export function makeAdminProductPath() {
  return '/api/admin/products'
}

export function makeAdminOrdersPath() {
  return '/api/admin/orders'
}

export function makeAdminSettingsPath() {
  return '/api/admin/settings'
}

export function makeMenuPath() {
  return '/api/menu'
}

export function makeOrdersPath() {
  return '/api/orders'
}

export function getPageTitle() {
  return 'SnackHub — Midnight cravings, sorted'
}

export function getPageDescription() {
  return 'Quick bites delivered to your hostel room.'
}
