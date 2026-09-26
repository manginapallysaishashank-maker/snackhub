# Running SnackHub locally

No .env file, no service account key, no Firebase Admin SDK needed.
The app talks to Firebase directly from the browser, same as the Firebase
config already embedded in lib/firebase-client.ts.

1. pnpm install
2. pnpm dev
3. Open http://localhost:3000 (storefront) and http://localhost:3000/admin (admin)
4. Log into /admin with the email/password you created in
   Firebase Console -> Authentication -> Users

Make sure your Firestore security rules are published (Firebase Console ->
Firestore Database -> Rules) so that signed-in admins can write data and
customers can browse/order.
