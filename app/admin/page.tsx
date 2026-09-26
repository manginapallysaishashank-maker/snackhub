import { AdminDashboard } from '@/components/admin-dashboard'

export const metadata = {
  title: 'Admin · SnackHub',
  description: 'Manage SnackHub items, orders, and store availability.',
}

export default function AdminPage() {
  return <AdminDashboard />
}
