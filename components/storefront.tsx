'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { addDoc, collection, doc, onSnapshot, writeBatch } from 'firebase/firestore'
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  ShoppingCart,
  X,
} from 'lucide-react'
import {
  categories,
  db,
  estimateDeliveryMinutes,
  formatClock,
  formatCountdown,
  formatRupees,
  iconForCategory,
  type Product,
  type SnackCategory,
} from '@/lib/firebase-client'

type CartLine = { id: string; qty: number }
const accents: Record<SnackCategory, string> = {
  sugary: '#A855F7',
  hot: '#FF5A5F',
  beverages: '#3B82F6',
  chips: '#F59E0B',
  biscuits: '#10B981',
}

export function Storefront() {
  const [items, setItems] = useState<Product[]>([])
  const [open, setOpen] = useState(true)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<SnackCategory | 'all'>('all')
  const [cart, setCart] = useState<CartLine[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [room, setRoom] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [payment, setPayment] = useState<'cash' | 'online'>('cash')
  const [submitting, setSubmitting] = useState(false)
  const [orderError, setOrderError] = useState('')
  const [receipt, setReceipt] = useState('')
  const [eta, setEta] = useState<{ minutes: number; at: number } | null>(null)
  const [orderStatus, setOrderStatus] = useState('pending')
  const [now, setNow] = useState(Date.now())

  // Track the placed order live (status changes) and tick the countdown.
  useEffect(() => {
    if (!receipt) return
    const unsub = onSnapshot(doc(db, 'orders', receipt), (snap) => {
      if (snap.exists()) setOrderStatus(String(snap.data().status ?? 'pending'))
    }, () => {})
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => { unsub(); clearInterval(timer) }
  }, [receipt])

  // Live Firestore sync - the storefront updates instantly whenever the
  // admin adds an item, changes stock, or opens/closes the store. No
  // server API layer or service account is involved.
  useEffect(() => {
    const unsubItems = onSnapshot(
      collection(db, 'items'),
      (snap) => {
        setItems(snap.docs.map((document) => ({ id: document.id, ...document.data() }) as Product))
        setLoading(false)
      },
      (err) => { setLoadError(err.message); setLoading(false) },
    )
    const unsubStore = onSnapshot(
      doc(db, 'settings', 'store'),
      (snap) => setOpen(snap.exists() ? snap.data().open !== false : true),
      (err) => setLoadError(err.message),
    )
    return () => {
      unsubItems()
      unsubStore()
    }
  }, [])

  const storeStatus = loadError ? 'Store status unavailable' : loading ? 'Checking store' : open ? 'Taking orders now' : 'Temporarily closed'
  const visibleItems = useMemo(() => {
    const normalized = search.trim().toLowerCase()
    return items.filter((item) => {
      const matchesCategory = category === 'all' || item.category === category
      return matchesCategory && (!normalized || item.name.toLowerCase().includes(normalized)) && item.stock > 0
    })
  }, [category, items, search])
  const cartLines = useMemo(() => cart.map((line) => ({
    ...line,
    product: items.find((item) => item.id === line.id),
  })).filter((line): line is CartLine & { product: Product } => Boolean(line.product)), [cart, items])
  const count = cart.reduce((sum, line) => sum + line.qty, 0)
  const total = cartLines.reduce((sum, line) => sum + line.product.price * line.qty, 0)

  function addItem(product: Product) {
    if (!open) return
    setCart((current) => {
      const existing = current.find((line) => line.id === product.id)
      if (existing) {
        if (existing.qty >= product.stock) return current
        return current.map((line) => line.id === product.id ? { ...line, qty: line.qty + 1 } : line)
      }
      return [...current, { id: product.id, qty: 1 }]
    })
  }

  function changeQuantity(id: string, delta: number) {
    const product = items.find((item) => item.id === id)
    setCart((current) => current.flatMap((line) => {
      if (line.id !== id) return [line]
      const next = line.qty + delta
      if (next < 1) return []
      if (product && next > product.stock) return [line]
      return [{ ...line, qty: next }]
    }))
  }

  async function placeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setOrderError('')
    if (!/^\d{3}$/.test(room.trim())) {
      setOrderError('Enter your 3-digit room number to continue.')
      return
    }
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setOrderError('Enter a valid 10-digit mobile number (starting with 6, 7, 8 or 9).')
      return
    }
    if (!cartLines.length) {
      setOrderError('Your tray is empty. Add a snack first.')
      return
    }
    setSubmitting(true)
    try {
      // Re-check stock against the latest live data before committing, in
      // case someone else ordered the last of something in the meantime.
      for (const line of cartLines) {
        const live = items.find((item) => item.id === line.id)
        if (!live || live.stock < line.qty) {
          throw new Error(`Sorry, "${line.product.name}" no longer has enough stock. Please review your tray.`)
        }
      }

      const batch = writeBatch(db)
      cartLines.forEach((line) => {
        const live = items.find((item) => item.id === line.id)!
        batch.update(doc(db, 'items', line.id), { stock: Math.max(0, live.stock - line.qty) })
      })
      await batch.commit()

      const etaMinutes = estimateDeliveryMinutes(cartLines.reduce((sum, line) => sum + line.qty, 0))
      const createdAt = Date.now()
      const etaAt = createdAt + etaMinutes * 60_000

      const orderRef = await addDoc(collection(db, 'orders'), {
        room: room.trim(),
        name: name.trim() || 'Guest',
        phone,
        items: cartLines.map((line) => ({ id: line.id, name: line.product.name, qty: line.qty, price: line.product.price })),
        total,
        payment,
        time: new Date().toLocaleString(),
        createdAt,
        etaMinutes,
        etaAt,
        status: 'pending',
      })

      setEta({ minutes: etaMinutes, at: etaAt })
      setOrderStatus('pending')
      setReceipt(orderRef.id)
      setCart([])
      setRoom('')
      setName('')
      setPhone('')
      setCartOpen(false)
    } catch (caught) {
      setOrderError(caught instanceof Error ? caught.message : 'Could not place your order. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#FFFCF9] text-[#202124]">
      <header className="sticky top-0 z-30 border-b border-[#F1EAE5] bg-[#FFFCF9]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6">
          <a href="#top" aria-label="SnackHub home" className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-[12px] bg-[#FF5A5F] text-white"><ShoppingBag size={18} /></span>
            <span className="font-display text-xl font-bold tracking-tight text-[#FF5A5F]">SnackHub</span>
          </a>
          <div className="flex items-center gap-3">
            <span className={`hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold sm:inline-flex ${open ? 'bg-[#EAF7EF] text-[#26754A]' : 'bg-[#FFF0EF] text-[#AE4246]'}`}><span className={`size-1.5 rounded-full ${open ? 'bg-[#2D9A5F]' : 'bg-[#E25257]'}`} />{storeStatus}</span>
            <button type="button" onClick={() => setCartOpen(true)} aria-label="Open tray" className="relative flex size-10 items-center justify-center rounded-full bg-[#292422] text-white transition hover:bg-[#413A37]"><ShoppingBag size={17} />{count > 0 && <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-[#FF5A5F] text-[10px] font-bold">{count}</span>}</button>
          </div>
        </div>
      </header>

      <section id="top" className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6">
        <div className="mb-7">
          <p className="text-[10px] font-bold uppercase tracking-[.17em] text-[#FF5A5F]">Midnight cravings, sorted.</p>
          <h1 className="font-display mt-1 text-3xl font-bold tracking-tight sm:text-4xl">What are you craving?</h1>
        </div>

        <div className="mb-5">
          <label className="flex h-12 items-center gap-2.5 rounded-2xl border border-[#EDE5DF] bg-white px-4 text-[#968D87] shadow-[0_2px_10px_rgba(58,38,29,.03)]">
            <Search size={17} />
            <span className="sr-only">Search the menu</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-[#292422] outline-none" placeholder="Search snacks…" />
            {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="rounded-full p-1 hover:bg-[#F5EEEA]"><X size={14} /></button>}
          </label>
        </div>

        <div className="mb-8 flex gap-2 overflow-x-auto pb-2" aria-label="Menu categories">
          <button type="button" onClick={() => setCategory('all')} aria-pressed={category === 'all'} className={`shrink-0 rounded-full border px-4 py-2.5 text-sm font-semibold transition ${category === 'all' ? 'border-[#252120] bg-[#252120] text-white' : 'border-[#EDE5DF] bg-white text-[#655D59] hover:border-[#D9CBC2]'}`}>Everything</button>
          {categories.map((item) => <button key={item.id} type="button" onClick={() => setCategory(item.id)} aria-pressed={category === item.id} className={`shrink-0 rounded-full border px-4 py-2.5 text-sm font-semibold transition ${category === item.id ? 'border-[#252120] bg-[#252120] text-white' : 'border-[#EDE5DF] bg-white text-[#655D59] hover:border-[#D9CBC2]'}`}>{item.title}</button>)}
        </div>

        {loadError ? <div role="alert" className="rounded-3xl border border-[#F2C6C5] bg-white px-5 py-10 text-center"><CircleAlert className="mx-auto text-[#D24A4D]" size={25} /><p className="mt-3 font-bold">The menu didn&apos;t load</p><p className="mt-1 text-sm text-[#817A76]">{loadError}</p></div> : loading ? <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="animate-pulse rounded-[26px] border border-[#F0E9E3] bg-white p-3"><div className="aspect-square rounded-[19px] bg-[#F4EEE9]" /><div className="mt-4 h-4 w-2/3 rounded bg-[#F4EEE9]" /><div className="mt-3 h-4 w-1/3 rounded bg-[#F4EEE9]" /></div>)}</div> : visibleItems.length === 0 ? <div className="rounded-[28px] border border-dashed border-[#E4D8D0] bg-white/70 px-5 py-16 text-center"><span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[#FFF0EF] text-[#FF5A5F]"><Search size={20} /></span><h3 className="mt-4 font-display text-xl font-bold">Nothing on the menu yet</h3><p className="mt-1 text-sm text-[#817A76]">{items.length ? 'Try another search or category.' : 'New snacks will show up here when they are added.'}</p>{(search || category !== 'all') && <button onClick={() => { setSearch(''); setCategory('all') }} className="mt-4 text-sm font-bold text-[#D84B50]">Clear filters</button>}</div> : <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
          {visibleItems.map((product) => <article key={product.id} className="group flex min-w-0 flex-col rounded-[24px] border border-[#F0E9E3] bg-white p-2.5 shadow-[0_4px_15px_rgba(58,38,29,.035)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_15px_35px_rgba(58,38,29,.09)] sm:rounded-[27px] sm:p-3.5">
            <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-[18px] bg-[#F7F2ED] sm:rounded-[21px]">
              {product.image ? <img src={product.image} alt={product.name} loading="lazy" className="size-full object-cover transition duration-300 group-hover:scale-[1.035]" onError={(event) => { event.currentTarget.style.display = 'none'; event.currentTarget.nextElementSibling?.classList.remove('hidden') }} /> : null}<span aria-hidden="true" className={`font-display text-5xl font-bold ${product.image ? 'hidden' : ''}`} style={{ color: accents[product.category] }}>{iconForCategory(product.category)}</span>
              {product.stock < 5 && <span className="absolute left-2 top-2 rounded-full bg-[#FFF0D7] px-2 py-1 text-[10px] font-bold text-[#8B5A14]">Only {product.stock} left</span>}
            </div>
            <div className="flex flex-1 flex-col px-1 pb-1 pt-3 sm:px-0.5 sm:pt-4">
              <span className="text-[10px] font-bold uppercase tracking-[.1em]" style={{ color: accents[product.category] }}>{categories.find((entry) => entry.id === product.category)?.title}</span>
              <h3 className="mt-1 min-h-10 text-sm font-bold leading-5 text-[#292422] sm:text-[15px]">{product.name}</h3>
              <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                <span className="font-display text-lg font-bold text-[#292422]">₹{formatRupees(product.price)}</span>
                <button type="button" disabled={!open || (cart.find((line) => line.id === product.id)?.qty ?? 0) >= product.stock} onClick={() => addItem(product)} aria-label={`Add ${product.name} to tray`} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#FFF0EF] text-[#E94D52] transition hover:bg-[#FF5A5F] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"><Plus size={19} strokeWidth={2.5} /></button>
              </div>
            </div>
          </article>)}
        </div>}
      </section>

      <footer className="border-t border-[#F1EAE5] bg-white px-5 py-7">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-left"><a href="#top" className="font-display text-lg font-bold text-[#FF5A5F]">SnackHub</a><p className="text-xs text-[#948A84]">Midnight cravings, sorted.</p></div>
      </footer>

      {cartOpen && <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
        <button aria-label="Close tray" onClick={() => setCartOpen(false)} className="absolute inset-0 bg-[#211B18]/45 backdrop-blur-[2px]" />
        <section role="dialog" aria-modal="true" aria-labelledby="tray-title" className="relative flex h-full w-full max-w-[460px] flex-col bg-[#FFFCF9] shadow-2xl animate-in slide-in-from-right duration-300">
          <div className="flex items-center justify-between border-b border-[#F0E9E3] px-5 py-5 sm:px-7">
            <div><p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#FF5A5F]">Your picks</p><h2 id="tray-title" className="font-display mt-0.5 text-2xl font-bold">Your tray <span className="text-base font-medium text-[#938984]">({count})</span></h2></div>
            <button type="button" onClick={() => setCartOpen(false)} aria-label="Close tray" className="rounded-full p-2.5 text-[#716A66] transition hover:bg-[#F2EAE4]"><X size={19} /></button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7">
            {cartLines.length === 0 ? <div className="flex h-full min-h-56 flex-col items-center justify-center text-center"><span className="flex size-14 items-center justify-center rounded-[20px] bg-[#FFF0EF] text-[#FF5A5F]"><ShoppingBag size={23} /></span><h3 className="font-display mt-4 text-lg font-bold">Your tray is empty</h3><p className="mt-1 text-sm text-[#817A76]">The good stuff is just a scroll away.</p><button type="button" onClick={() => setCartOpen(false)} className="mt-4 text-sm font-bold text-[#D84B50]">Back to menu</button></div> : <div className="flex flex-col gap-3">
              {cartLines.map(({ id, qty, product }) => <div key={id} className="flex items-center gap-3 rounded-2xl border border-[#F0E9E3] bg-white p-3">
                <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#F7F2ED]">{product.image ? <img src={product.image} alt="" className="size-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; event.currentTarget.nextElementSibling?.classList.remove('hidden') }} /> : null}<span className={`font-display text-xl font-bold ${product.image ? 'hidden' : ''}`} style={{ color: accents[product.category] }}>{iconForCategory(product.category)}</span></div>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{product.name}</p><p className="mt-1 text-xs font-semibold text-[#E65358]">₹{formatRupees(product.price)} each</p></div>
                <div className="flex items-center gap-1.5"><button type="button" onClick={() => changeQuantity(id, -1)} aria-label={`Remove one ${product.name}`} className="flex size-8 items-center justify-center rounded-full bg-[#F4EEEA] text-[#5F5753]"><Minus size={14} /></button><span className="w-5 text-center text-sm font-bold">{qty}</span><button type="button" onClick={() => changeQuantity(id, 1)} disabled={qty >= product.stock} aria-label={`Add one ${product.name}`} className="flex size-8 items-center justify-center rounded-full bg-[#F4EEEA] text-[#5F5753] disabled:opacity-40"><Plus size={14} /></button></div>
              </div>)}
            </div>}
          </div>
          <form onSubmit={placeOrder} className="border-t border-[#F0E9E3] bg-white px-5 pb-6 pt-5 sm:px-7 sm:pb-7">
            {orderError && <p role="alert" className="mb-3 rounded-xl bg-[#FFF0EF] px-3 py-2 text-sm font-medium text-[#AC3E42]">{orderError}</p>}
            <label className="mb-3 block"><span className="mb-1.5 block text-xs font-bold text-[#514944]">Room number <span className="text-[#D84B50]">*</span></span><input required inputMode="numeric" pattern="[0-9]{3}" maxLength={3} value={room} onChange={(event) => setRoom(event.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="e.g. 204" className="h-12 w-full rounded-xl border border-[#EAE1DA] bg-[#FFFCF9] px-3.5 text-sm outline-none transition focus:border-[#FF8588] focus:ring-3 focus:ring-[#FF5A5F]/10" /></label>
            <label className="mb-3 block"><span className="mb-1.5 block text-xs font-bold text-[#514944]">Mobile number <span className="text-[#D84B50]">*</span></span><input required type="tel" inputMode="numeric" autoComplete="tel-national" pattern="[6-9][0-9]{9}" minLength={10} maxLength={10} title="Enter a valid 10-digit mobile number" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit mobile number" className="h-12 w-full rounded-xl border border-[#EAE1DA] bg-[#FFFCF9] px-3.5 text-sm outline-none transition focus:border-[#FF8588] focus:ring-3 focus:ring-[#FF5A5F]/10" /></label>
            <label className="mb-4 block"><span className="mb-1.5 block text-xs font-bold text-[#514944]">Your name <span className="font-normal text-[#968D87]">(optional)</span></span><input maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="What should we call you?" className="h-12 w-full rounded-xl border border-[#EAE1DA] bg-[#FFFCF9] px-3.5 text-sm outline-none transition focus:border-[#FF8588] focus:ring-3 focus:ring-[#FF5A5F]/10" /></label>
            <div className="mb-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => setPayment('cash')} aria-pressed={payment === 'cash'} className={`flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-bold transition ${payment === 'cash' ? 'border-[#FF5A5F] bg-[#FFF0EF] text-[#D94A4F]' : 'border-[#EAE1DA] bg-white text-[#6F6660]'}`}><span aria-hidden="true">₹</span> Cash</button><button type="button" onClick={() => setPayment('online')} aria-pressed={payment === 'online'} className={`flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-bold transition ${payment === 'online' ? 'border-[#FF5A5F] bg-[#FFF0EF] text-[#D94A4F]' : 'border-[#EAE1DA] bg-white text-[#6F6660]'}`}><Check size={16} /> Online</button></div>
            <div className="mb-4 flex items-center justify-between border-t border-dashed border-[#E7DDD5] pt-4"><span className="text-sm font-semibold text-[#655D59]">Order total</span><span className="font-display text-2xl font-bold">₹{formatRupees(total)}</span></div>
            <button type="submit" disabled={submitting || !cartLines.length || !open} className="flex h-13 w-full items-center justify-center gap-2 rounded-full bg-[#FF5A5F] px-5 text-sm font-bold text-white shadow-[0_7px_16px_rgba(255,90,95,.18)] transition hover:bg-[#e94b50] disabled:cursor-not-allowed disabled:opacity-45">{submitting ? 'Placing your order…' : open ? 'Place order' : 'Store is closed'}{!submitting && open && <ArrowRight size={17} />}</button>
            <p className="mt-3 text-center text-[11px] text-[#968D87]">Your order and payment preference will be shared with the store team.</p>
          </form>
        </section>
      </div>}

      {receipt && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#211B18]/50 p-5 backdrop-blur-sm" role="presentation">
        <section role="dialog" aria-modal="true" aria-labelledby="order-success" className="w-full max-w-sm rounded-[30px] bg-white px-7 py-9 text-center shadow-2xl">
          <span className="mx-auto flex size-16 items-center justify-center rounded-[22px] bg-[#EAF7EF] text-[#288251]"><Check size={27} strokeWidth={2.6} /></span><p className="mt-5 text-[10px] font-bold uppercase tracking-[.16em] text-[#31935D]">Order received</p><h2 id="order-success" className="font-display mt-1 text-3xl font-bold">You&apos;re all set!</h2><p className="mt-2 text-sm leading-6 text-[#817A76]">Your snacks are headed to your room. Keep this order reference handy.</p>
          {eta && (orderStatus === 'delivered' ? <p className="mt-4 rounded-xl bg-[#EAF7EF] px-3 py-3 text-sm font-bold text-[#26754A]">Delivered. Enjoy your snacks!</p> : orderStatus === 'cancelled' ? <p className="mt-4 rounded-xl bg-[#FFF0EF] px-3 py-3 text-sm font-bold text-[#AE4246]">This order was cancelled by the store.</p> : <div className="mt-4 rounded-xl bg-[#FFF5DE] px-3 py-3"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#A96E14]">Estimated delivery</p><p className="font-display mt-1 text-2xl font-bold text-[#292422]">{eta.at - now > 0 ? formatCountdown(eta.at - now) : 'Arriving any moment'}</p><p className="mt-1 text-xs text-[#817A76]">About {eta.minutes} min &middot; by {formatClock(eta.at)}</p></div>)}<p className="mt-4 rounded-xl bg-[#F7F2ED] px-3 py-2 font-mono text-xs text-[#6F6660]">{receipt}</p><button type="button" onClick={() => setReceipt('')} className="mt-6 w-full rounded-full bg-[#252120] py-3.5 text-sm font-bold text-white transition hover:bg-[#39322F]">Back to the menu</button>
        </section>
      </div>}

      {count > 0 && !cartOpen && <button type="button" onClick={() => setCartOpen(true)} className="fixed inset-x-4 bottom-4 z-20 flex h-14 items-center justify-between rounded-full bg-[#252120] px-5 text-white shadow-[0_12px_30px_rgba(34,28,25,.25)] md:hidden"><span className="flex items-center gap-2 text-sm font-bold"><ShoppingCart size={18} /> View tray <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">{count}</span></span><span className="flex items-center gap-1 text-sm font-bold">₹{formatRupees(total)} <ChevronDown size={16} /></span></button>}
    </main>
  )
}
