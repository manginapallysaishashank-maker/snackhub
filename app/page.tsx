import { Storefront } from '@/components/storefront'

export default function HomePage() {
  return <Storefront />
}

// Store data is loaded from Firestore through the public API.
export const dynamic = 'force-dynamic'
