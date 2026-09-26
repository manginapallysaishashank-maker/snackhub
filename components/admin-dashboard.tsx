'use client'

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { addDoc, collection, deleteDoc, doc, onSnapshot, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import {
  ArrowLeft,
  Check,
  Clock3,
  LockKeyhole,
  LogOut,
  Package,
  Plus,
  Search,
  ShoppingBag,
  Store,
  Trash2,
  X,
} from 'lucide-react'
import {
  auth,
  categories,
  db,
  formatOrderTime,
  formatRupees,
  getFriendlyError,
  isSnackCategory,
  orderStatuses,
  safeText,
  validProductPrice,
  validProductStock,
  type OrderStatus,
  type Product,
  type StoreOrder,
} from '@/lib/firebase-client'

type DashboardData = { items: Product[]; orders: StoreOrder[]; store: { open: boolean } }
const emptyDashboard: DashboardData = { items: [], orders: [], store: { open: true } }
const categoryTint: Record<string, string> = { sugary: '#A855F7', hot: '#FF5A5F', beverages: '#3B82F6', chips: '#D99817', biscuits: '#10B981' }

export function AdminDashboard() {
  const [signedIn, setSignedIn] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [resetMessage, setResetMessage] = useState('')
  const [section, setSection] = useState<'overview' | 'items' | 'orders'>('overview')
  const [itemSearch, setItemSearch] = useState('')
  const [orderSearch, setOrderSearch] = useState('')
  const [productName, setProductName] = useState('')
  const [productPrice, setProductPrice] = useState('')
  const [productCategory, setProductCategory] = useState('sugary')
  const [productStock, setProductStock] = useState('')
  const [productImageUrl, setProductImageUrl] = useState('')
  const [productError, setProductError] = useState('')
  const [productBusy, setProductBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard)
  const [dataLoading, setDataLoading] = useState(true)
  const [dataError, setDataError] = useState('')

  useEffect(() => onAuthStateChanged(auth, (user) => {
    setSignedIn(Boolean(user))
    setAuthLoading(false)
  }), [])

  // Live Firestore listeners - this is what keeps the dashboard in sync with
  // the storefront and with any other admin session, in real time, with no
  // server API layer and no service account needed.
  useEffect(() => {
    const unsubItems = onSnapshot(
      collection(db, 'items'),
      (snap) => {
        setDashboard((current) => ({ ...current, items: snap.docs.map((document) => ({ id: document.id, ...document.data() }) as Product) }))
        setDataLoading(false)
      },
      (err) => setDataError(err.message),
    )
    const unsubOrders = onSnapshot(
      collection(db, 'orders'),
      (snap) => {
        const orders = snap.docs
          .map((document) => ({ id: document.id, ...document.data() }) as StoreOrder)
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        setDashboard((current) => ({ ...current, orders }))
      },
      (err) => setDataError(err.message),
    )
    const unsubStore = onSnapshot(
      doc(db, 'settings', 'store'),
      (snap) => {
        setDashboard((current) => ({ ...current, store: { open: snap.exists() ? snap.data().open !== false : true } }))
      },
      (err) => setDataError(err.message),
    )
    return () => {
      unsubItems()
      unsubOrders()
      unsubStore()
    }
  }, [])

  const filteredItems = useMemo(() => dashboard.items.filter((item) => item.name.toLowerCase().includes(itemSearch.trim().toLowerCase())), [dashboard.items, itemSearch])
  const filteredOrders = useMemo(() => dashboard.orders.filter((order) => `${order.room} ${order.name} ${order.id}`.toLowerCase().includes(orderSearch.trim().toLowerCase())), [dashboard.orders, orderSearch])
  const pendingCount = dashboard.orders.filter((order) => order.status === 'pending').length

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoginError('')
    setLoginBusy(true)
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
      // onAuthStateChanged above flips signedIn to true once this resolves.
    } catch (error) {
      setLoginError(getFriendlyError(error))
      await signOut(auth).catch(() => undefined)
    } finally {
      setLoginBusy(false)
    }
  }

  async function requestPasswordReset() {
    setLoginError('')
    setResetMessage('')
    if (!email.trim()) {
      setLoginError('Enter your admin email first, then request a reset link.')
      return
    }
    try {
      await sendPasswordResetEmail(auth, email.trim())
      setResetMessage('If this account exists, Firebase has sent a password reset link.')
    } catch (caught) {
      setLoginError(getFriendlyError(caught))
    }
  }

  async function runAction(key: string, action: () => Promise<void>, successMessage?: string) {
    setBusyAction(key)
    setActionError('')
    setNotice('')
    try {
      await action()
      if (successMessage) setNotice(successMessage)
    } catch (caught) {
      setActionError(getFriendlyError(caught))
    } finally {
      setBusyAction('')
    }
  }

  function deleteItem(item: Product) {
    if (!confirm(`Delete ${item.name} from the menu?`)) return
    void runAction(item.id, async () => {
      await deleteDoc(doc(db, 'items', item.id))
    }, 'Menu item deleted.')
  }

  function toggleStore() {
    void runAction('store', async () => {
      await setDoc(doc(db, 'settings', 'store'), { open: !dashboard.store.open }, { merge: true })
    }, `Store is now ${dashboard.store.open ? 'closed' : 'open'}.`)
  }

  function clearAllOrders() {
    if (!confirm('Delete every order? This cannot be undone.')) return
    void runAction('clear', async () => {
      const batch = writeBatch(db)
      dashboard.orders.forEach((order) => batch.delete(doc(db, 'orders', order.id)))
      await batch.commit()
    }, 'All orders cleared.')
  }

  function updateOrderStatus(order: StoreOrder, status: OrderStatus) {
    void runAction(order.id, async () => {
      await updateDoc(doc(db, 'orders', order.id), { status })
    })
  }

  async function createItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setProductError('')
    setProductBusy(true)
    try {
      const name = safeText(productName, 80)
      const price = Number(productPrice)
      const stock = Number(productStock)
      const image = productImageUrl.trim()
      if (!name) throw new Error('Enter an item name.')
      if (!validProductPrice(price)) throw new Error('Enter a valid price.')
      if (!validProductStock(stock)) throw new Error('Enter a valid stock quantity.')
      if (!isSnackCategory(productCategory)) throw new Error('Choose a category.')
      if (image && !/^https:\/\//i.test(image)) throw new Error('Use a secure HTTPS image URL (e.g. from imgbb.com).')
      await addDoc(collection(db, 'items'), { name, price, category: productCategory, stock, image })
      setProductName('')
      setProductPrice('')
      setProductStock('')
      setProductImageUrl('')
      setNotice('Item added to the menu.')
    } catch (caught) {
      setProductError(getFriendlyError(caught))
    } finally {
      setProductBusy(false)
    }
  }

  if (authLoading) return <div className="flex min-h-screen items-center justify-center bg-[#F8F5F2] text-sm font-semibold text-[#716A66]">Loading secure admin…</div>

  if (!signedIn) return <main className="flex min-h-screen items-center justify-center bg-[#F8F5F2] px-4 py-10">
    <div className="w-full max-w-[440px]">
      <a href="/" className="mb-7 inline-flex items-center gap-2 text-sm font-bold text-[#7D746E] transition hover:text-[#FF5A5F]"><ArrowLeft size={16} /> Back to SnackHub</a>
      <section className="rounded-[30px] border border-[#EEE5DE] bg-white p-7 shadow-[0_25px_80px_rgba(62,42,31,.09)] sm:p-9">
        <span className="flex size-14 items-center justify-center rounded-[19px] bg-[#FFF0EF] text-[#FF5A5F]"><LockKeyhole size={23} /></span>
        <p className="mt-6 text-[10px] font-bold uppercase tracking-[.17em] text-[#FF5A5F]">SnackHub control room</p>
        <h1 className="font-display mt-1 text-3xl font-bold tracking-tight">Admin sign in</h1>
        <p className="mt-2 text-sm leading-6 text-[#817A76]">Use your authorized Firebase account to manage menu items, orders, and store availability.</p>
        <form onSubmit={handleLogin} className="mt-7 flex flex-col gap-4">
          <label className="text-xs font-bold text-[#514944]">Email<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 h-12 w-full rounded-xl border border-[#EAE1DA] bg-[#FFFCF9] px-3.5 text-sm font-normal outline-none focus:border-[#FF8588] focus:ring-3 focus:ring-[#FF5A5F]/10" placeholder="admin@example.com" /></label>
          <label className="text-xs font-bold text-[#514944]">Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 h-12 w-full rounded-xl border border-[#EAE1DA] bg-[#FFFCF9] px-3.5 text-sm font-normal outline-none focus:border-[#FF8588] focus:ring-3 focus:ring-[#FF5A5F]/10" placeholder="Your password" /></label>
          {loginError && <p role="alert" className="rounded-xl bg-[#FFF0EF] px-3 py-2.5 text-sm text-[#AC3E42]">{loginError}</p>}
          {resetMessage && <p role="status" className="rounded-xl bg-[#EFFAF2] px-3 py-2.5 text-sm text-[#26754A]">{resetMessage}</p>}
          <button disabled={loginBusy} className="mt-1 h-12 rounded-full bg-[#FF5A5F] text-sm font-bold text-white transition hover:bg-[#e94b50] disabled:opacity-55">{loginBusy ? 'Signing in…' : 'Sign in securely'}</button>
          <button type="button" onClick={() => void requestPasswordReset()} className="self-center text-xs font-semibold text-[#827A76] underline-offset-4 hover:text-[#D84B50] hover:underline">Forgot password?</button>
        </form>
        <p className="mt-5 text-center text-[11px] leading-5 text-[#968D87]">Access is verified directly by Firebase Authentication.</p>
      </section>
    </div>
  </main>

  const inputClass = 'h-11 w-full rounded-xl border border-[#EAE1DA] bg-[#FFFCF9] px-3 text-sm outline-none focus:border-[#FF8588] focus:ring-3 focus:ring-[#FF5A5F]/10'
  const labelClass = 'flex flex-col gap-1.5 text-xs font-bold text-[#514944]'
  return <main className="min-h-screen bg-[#F8F5F2] text-[#292422]">
    <header className="sticky top-0 z-20 border-b border-[#EEE7E0] bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex min-h-[68px] max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3"><a href="/" aria-label="SnackHub store" className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-[#FF5A5F] text-white"><ShoppingBag size={19} /></a><div className="min-w-0"><p className="font-display truncate text-lg font-bold text-[#FF5A5F] sm:text-xl">SnackHub <span className="font-sans text-xs font-semibold text-[#9B918A]">/ Admin</span></p><p className="hidden text-[10px] text-[#968D87] sm:block">Store operations</p></div></div>
        <div className="flex items-center gap-2 sm:gap-3"><span className={`hidden items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold sm:inline-flex ${dashboard.store.open ? 'bg-[#EAF7EF] text-[#26754A]' : 'bg-[#FFF0EF] text-[#AE4246]'}`}><span className={`size-1.5 rounded-full ${dashboard.store.open ? 'bg-[#2D9A5F]' : 'bg-[#E25257]'}`} />{dashboard.store.open ? 'Open' : 'Closed'}</span><a href="/" className="rounded-full border border-[#EAE1DA] px-3 py-2 text-xs font-bold text-[#655D59] transition hover:bg-[#F8F5F2] sm:px-4">View store</a><button onClick={() => signOut(auth)} aria-label="Sign out" className="rounded-full border border-[#EAE1DA] p-2.5 text-[#655D59] transition hover:bg-[#FFF0EF] hover:text-[#C8474B]"><LogOut size={16} /></button></div>
      </div>
    </header>

    <div className="mx-auto max-w-[1440px] px-4 pb-12 pt-6 sm:px-6 sm:pt-9">
      <div className="mb-7 flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-[10px] font-bold uppercase tracking-[.17em] text-[#FF5A5F]">Good to see you</p><h1 className="font-display mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Control room</h1><p className="mt-1 text-sm text-[#817A76]">Your live menu and orders, all in one place.</p></div><div className="flex items-center gap-2"><span className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[#C9E9D4] bg-[#EFFAF2] px-4 text-xs font-bold text-[#26754A]"><span className="size-1.5 rounded-full bg-[#2D9A5F]" />Live</span><button onClick={() => clearAllOrders()} disabled={Boolean(busyAction) || dashboard.orders.length === 0} className="inline-flex h-10 items-center gap-2 rounded-full border border-[#F2D0CE] bg-white px-4 text-xs font-bold text-[#BD4D50] transition hover:bg-[#FFF0EF] disabled:opacity-45"><Trash2 size={14} />Clear orders</button></div></div>

      {notice && <div role="status" className="mb-4 flex items-center justify-between rounded-xl border border-[#C9E9D4] bg-[#EFFAF2] px-4 py-3 text-sm font-semibold text-[#26754A]"><span className="flex items-center gap-2"><Check size={16} />{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss message"><X size={15} /></button></div>}
      {actionError && <div role="alert" className="mb-4 rounded-xl border border-[#F2C6C5] bg-[#FFF0EF] px-4 py-3 text-sm text-[#AC3E42]">{actionError}</div>}
      {dataError && <div role="alert" className="mb-4 rounded-xl border border-[#F2C6C5] bg-[#FFF0EF] px-4 py-3 text-sm text-[#AC3E42]">Live data could not load: {dataError}. Check that your Firestore security rules allow signed-in admin access.</div>}

      <nav aria-label="Admin sections" className="mb-6 flex w-full gap-1 overflow-x-auto rounded-2xl border border-[#ECE4DD] bg-white p-1 sm:w-fit">{(['overview', 'items', 'orders'] as const).map((tab) => <button key={tab} onClick={() => setSection(tab)} aria-current={section === tab ? 'page' : undefined} className={`shrink-0 rounded-xl px-4 py-2.5 text-xs font-bold capitalize transition sm:px-5 ${section === tab ? 'bg-[#292422] text-white shadow-sm' : 'text-[#716A66] hover:bg-[#F8F5F2]'}`}>{tab}</button>)}</nav>

      {section === 'overview' && <div className="grid gap-5 xl:grid-cols-[1fr_1.1fr]">
        <section className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 sm:gap-4"><StatCard icon={<Package size={17} />} label="Menu items" value={dataLoading ? '—' : dashboard.items.length} accent="coral" /><StatCard icon={<Clock3 size={17} />} label="Pending orders" value={dataLoading ? '—' : pendingCount} accent="amber" /><StatCard icon={<ShoppingBag size={17} />} label="Total orders" value={dataLoading ? '—' : dashboard.orders.length} accent="violet" /><StatCard icon={<Store size={17} />} label="Store status" value={dataLoading ? '—' : dashboard.store.open ? 'Open' : 'Closed'} accent={!dataLoading && dashboard.store.open ? 'green' : 'coral'} /></div>
          <section className="rounded-[26px] border border-[#ECE4DD] bg-white p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#968D87]">Order availability</p><h2 className="font-display mt-1 text-xl font-bold">{dataLoading ? 'Checking store status' : `Store is ${dashboard.store.open ? 'open' : 'closed'}`}</h2><p className="mt-1 text-xs leading-5 text-[#817A76]">{dataLoading ? 'Waiting for the current store setting.' : dashboard.store.open ? 'Customers can browse and place orders.' : 'The menu stays visible, but customers cannot order.'}</p></div><span className={`flex size-11 items-center justify-center rounded-2xl ${dashboard.store.open ? 'bg-[#EAF7EF] text-[#288251]' : 'bg-[#FFF0EF] text-[#C8474B]'}`}><Store size={19} /></span></div><button disabled={dataLoading || Boolean(busyAction)} onClick={() => toggleStore()} className={`mt-5 h-11 w-full rounded-full text-sm font-bold text-white transition disabled:opacity-50 ${dashboard.store.open ? 'bg-[#292422] hover:bg-[#413A37]' : 'bg-[#FF5A5F] hover:bg-[#e94b50]'}`}>{busyAction === 'store' ? 'Updating…' : dashboard.store.open ? 'Close store' : 'Open store'}</button></section>
          <section className="rounded-[26px] border border-[#ECE4DD] bg-white p-5 sm:p-6"><div className="flex items-center justify-between"><div><h2 className="font-display text-lg font-bold">Menu by category</h2><p className="mt-1 text-xs text-[#817A76]">Current item count from the menu.</p></div><button onClick={() => setSection('items')} aria-label="Manage menu items" className="rounded-full p-2 text-[#817A76] hover:bg-[#F8F5F2]"><ArrowLeft className="rotate-180" size={16} /></button></div><div className="mt-4 flex flex-col gap-3">{categories.map((category) => { const amount = dashboard.items.filter((item) => item.category === category.id).length; return <div key={category.id} className="flex items-center gap-3"><span className="size-2.5 rounded-full" style={{ background: categoryTint[category.id] }} /><span className="flex-1 text-xs font-semibold text-[#5F5753]">{category.title}</span><span className="text-xs font-bold text-[#817A76]">{amount}</span><div className="h-1.5 w-20 overflow-hidden rounded-full bg-[#F1EBE5]"><div className="h-full rounded-full" style={{ width: `${dashboard.items.length ? (amount / dashboard.items.length) * 100 : 0}%`, background: categoryTint[category.id] }} /></div></div> })}</div></section>
        </section>
        <OrdersPanel orders={dashboard.orders.slice(0, 5)} onStatusChange={updateOrderStatus} busyAction={busyAction} title="Recent orders" />
      </div>}

      {section === 'items' && <div className="grid items-start gap-5 xl:grid-cols-[minmax(300px,.72fr)_minmax(0,1.28fr)]">
        <section className="rounded-[26px] border border-[#ECE4DD] bg-white p-5 sm:p-6"><div className="mb-5 flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-[14px] bg-[#FFF0EF] text-[#FF5A5F]"><Plus size={19} /></span><div><h2 className="font-display text-lg font-bold">Add a menu item</h2><p className="text-xs text-[#817A76]">It will appear in its category on the storefront.</p></div></div>
          <form onSubmit={createItem} className="flex flex-col gap-3.5">
            <label className={labelClass}>Item name<input required maxLength={80} value={productName} onChange={(event) => setProductName(event.target.value)} className={inputClass} placeholder="Name on the menu" /></label>
            <div className="grid grid-cols-2 gap-3"><label className={labelClass}>Price (₹)<input required type="number" min="1" max="100000" step="1" value={productPrice} onChange={(event) => setProductPrice(event.target.value)} className={inputClass} placeholder="0" /></label><label className={labelClass}>Stock quantity<input required type="number" min="0" max="100000" step="1" value={productStock} onChange={(event) => setProductStock(event.target.value)} className={inputClass} placeholder="0" /></label></div>
            <label className={labelClass}>Category<select value={productCategory} onChange={(event) => setProductCategory(event.target.value)} className={inputClass}>{categories.map((category) => <option key={category.id} value={category.id}>{category.title}</option>)}</select></label>
            <label className={labelClass}>Image URL <span className="font-normal text-[#968D87]">(paste a direct link, e.g. from imgbb.com)</span><input type="url" value={productImageUrl} onChange={(event) => setProductImageUrl(event.target.value)} className={inputClass} placeholder="https://…" /></label>
            {productError && <p role="alert" className="rounded-xl bg-[#FFF0EF] px-3 py-2 text-xs text-[#AC3E42]">{productError}</p>}
            <button disabled={productBusy} className="mt-1 flex h-11 items-center justify-center gap-2 rounded-full bg-[#FF5A5F] text-sm font-bold text-white transition hover:bg-[#e94b50] disabled:opacity-55">{productBusy ? 'Adding item…' : <><Plus size={16} /> Add item</>}</button>
          </form>
        </section>
        <section className="overflow-hidden rounded-[26px] border border-[#ECE4DD] bg-white"><div className="flex flex-col gap-3 border-b border-[#F1EBE5] p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div><h2 className="font-display text-lg font-bold">Current items <span className="ml-1 text-sm font-medium text-[#968D87]">{dashboard.items.length}</span></h2><p className="text-xs text-[#817A76]">Menu inventory and available stock.</p></div><label className="flex h-10 w-full items-center gap-2 rounded-xl border border-[#EAE1DA] px-3 text-[#968D87] sm:max-w-[230px]"><Search size={15} /><span className="sr-only">Search items</span><input value={itemSearch} onChange={(event) => setItemSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs text-[#292422] outline-none" placeholder="Search items" /></label></div><div className="divide-y divide-[#F3EDE8]">{dataLoading ? <LoadingRows /> : filteredItems.length === 0 ? <EmptyPanel title={dashboard.items.length ? 'No matching items' : 'No menu items yet'} text={dashboard.items.length ? 'Try a different search.' : 'Add your first menu item using the form.'} /> : filteredItems.map((item) => <div key={item.id} className="flex items-center gap-3 px-4 py-3.5 sm:px-6"><div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#F7F2ED]">{item.image ? <img src={item.image} alt="" className="size-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; event.currentTarget.nextElementSibling?.classList.remove('hidden') }} /> : null}<Package size={19} className={`text-[#B2A79F] ${item.image ? 'hidden' : ''}`} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{item.name}</p><div className="mt-1 flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#F8F5F2] px-2 py-0.5 text-[10px] font-bold" style={{ color: categoryTint[item.category] }}>{categories.find((category) => category.id === item.category)?.title ?? 'Uncategorized'}</span><span className={`text-[10px] font-semibold ${item.stock < 5 ? 'text-[#B2741B]' : 'text-[#968D87]'}`}>{item.stock} in stock</span></div></div><span className="hidden text-sm font-bold sm:block">₹{formatRupees(item.price)}</span><button disabled={Boolean(busyAction)} onClick={() => deleteItem(item)} aria-label={`Delete ${item.name}`} className="rounded-full p-2.5 text-[#A79D96] transition hover:bg-[#FFF0EF] hover:text-[#C8474B] disabled:opacity-40"><Trash2 size={16} /></button></div>)}</div></section>
      </div>}

      {section === 'orders' && <OrdersPanel orders={filteredOrders} onStatusChange={updateOrderStatus} busyAction={busyAction} title="All orders" search={orderSearch} onSearch={setOrderSearch} />}
    </div>
  </main>
}

function StatCard({ icon, label, value, accent }: { icon: ReactNode; label: string; value: string | number; accent: string }) {
  const styles: Record<string, string> = { coral: 'bg-[#FFF0EF] text-[#E15055]', amber: 'bg-[#FFF5DE] text-[#A96E14]', violet: 'bg-[#F4EDFF] text-[#8354C4]', green: 'bg-[#EAF7EF] text-[#288251]' }
  return <article className="rounded-[23px] border border-[#ECE4DD] bg-white p-4 sm:p-5"><span className={`flex size-9 items-center justify-center rounded-xl ${styles[accent]}`}>{icon}</span><p className="font-display mt-3 text-2xl font-bold sm:text-3xl">{value}</p><p className="mt-0.5 text-[11px] font-semibold text-[#817A76] sm:text-xs">{label}</p></article>
}

function OrdersPanel({
  orders,
  onStatusChange,
  busyAction,
  title,
  search,
  onSearch,
}: {
  orders: StoreOrder[]
  onStatusChange: (order: StoreOrder, status: OrderStatus) => void
  busyAction: string
  title: string
  search?: string
  onSearch?: (value: string) => void
}) {
  return <section className="overflow-hidden rounded-[26px] border border-[#ECE4DD] bg-white"><div className="flex flex-col gap-3 border-b border-[#F1EBE5] p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-[14px] bg-[#FFF5DE] text-[#A96E14]"><ShoppingBag size={18} /></span><div><h2 className="font-display text-lg font-bold">{title} <span className="ml-1 text-sm font-medium text-[#968D87]">{orders.length}</span></h2><p className="text-xs text-[#817A76]">Latest order activity and fulfillment status.</p></div></div>{onSearch && <label className="flex h-10 w-full items-center gap-2 rounded-xl border border-[#EAE1DA] px-3 text-[#968D87] sm:max-w-[245px]"><Search size={15} /><span className="sr-only">Search orders</span><input value={search} onChange={(event) => onSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs text-[#292422] outline-none" placeholder="Room, name, or order ID" /></label>}</div>
    {orders.length === 0 ? <EmptyPanel title="No orders to show" text="New customer orders will appear here." /> : <div className="divide-y divide-[#F3EDE8]">{orders.map((order) => <article key={order.id} className="p-5 transition hover:bg-[#FFFCF9] sm:px-6"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><span className="rounded-full bg-[#292422] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.06em] text-white">Room {order.room}</span><span className="truncate text-xs font-semibold text-[#655D59]">{order.name || 'Guest'}</span></div><span className="font-display text-lg font-bold">₹{formatRupees(order.total)}</span></div><div className="mt-3 flex flex-wrap gap-1.5">{order.items.map((item, index) => <span key={`${item.name}-${index}`} className="rounded-lg bg-[#F8F5F2] px-2 py-1 text-[10px] font-semibold text-[#655D59]">{item.qty} × {item.name}</span>)}</div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-3 text-[10px] font-semibold text-[#968D87]"><span>{order.payment === 'online' ? 'Online payment' : 'Cash on delivery'}</span><span className="flex items-center gap-1"><Clock3 size={12} />{formatOrderTime(order.createdAt || order.time)}</span><span className="font-mono">#{order.id.slice(0, 8)}</span></div><label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.06em] text-[#817A76]">Status<select aria-label={`Status for order ${order.id}`} disabled={busyAction === order.id} value={order.status || 'pending'} onChange={(event) => onStatusChange(order, event.target.value as OrderStatus)} className="h-9 rounded-xl border border-[#EAE1DA] bg-white px-2 text-xs font-bold normal-case tracking-normal text-[#39322F] outline-none focus:border-[#FF8588]">{orderStatuses.map((status) => <option value={status} key={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>)}</select></label></div></article>)}</div>}
  </section>
}

function LoadingRows() {
  return <div className="flex flex-col gap-3 p-6">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-14 animate-pulse rounded-xl bg-[#F7F2ED]" />)}</div>
}

function EmptyPanel({ title, text }: { title: string; text: string }) {
  return <div className="px-5 py-12 text-center"><span className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-[#F8F5F2] text-[#A99F98]"><Package size={19} /></span><h3 className="font-display mt-3 text-base font-bold">{title}</h3><p className="mt-1 text-xs text-[#817A76]">{text}</p></div>
}
