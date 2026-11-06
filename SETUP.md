# Setting up Adwoaba's Lounge

You only do this once. It takes about 15 minutes.

## 1. Create the Firebase project

1. Go to https://console.firebase.google.com and sign in with the shop's Google account.
2. Click **Create a project**. Name it `adwoabas-lounge` (any name works). You can turn Google Analytics off.

## 2. Turn on staff login

1. In the project, open **Build > Authentication** and click **Get started**.
2. Under **Sign-in method**, enable **Email/Password** (the first switch only) and save.
3. Open the **Users** tab and click **Add user** for each staff member. Enter their email and a password.
4. Open **Settings > User actions** and untick **Enable create (sign-up)**, so nobody can make their own account.

## 3. Create the database

1. Open **Build > Firestore Database** and click **Create database**.
2. Pick a location close to Ghana, for example `europe-west1 (Belgium)` or `africa-south1 (Johannesburg)`. This cannot be changed later.
3. Start in **production mode**.
4. Open the **Rules** tab, delete what is there, and paste in the contents of `firestore.rules` from this repository.
5. Check the staff list in the pasted rules matches the staff emails from step 2 (each in quotes, lowercase, separated by commas):

   ```
   && request.auth.token.email.lower() in [
     'owner@gmail.com',
     'shopassistant@gmail.com'
   ];
   ```

6. Click **Publish**.

Whenever you add a new staff member later, add them in Authentication **and** add their email to these rules.

## 4. Connect the app to the database

1. Click the gear icon next to **Project Overview**, then **Project settings**.
2. Under **Your apps**, click the web icon `</>`. Name it `Adwoaba's Lounge app`. Do not tick Firebase Hosting.
3. Firebase shows a `firebaseConfig` block with `apiKey`, `authDomain`, `projectId` and so on.
4. Put those values into `src/firebase-config.js`, replacing `null`, for example:

   ```js
   export const firebaseConfig = {
     apiKey: '...',
     authDomain: '...',
     projectId: '...',
     storageBucket: '...',
     messagingSenderId: '...',
     appId: '...',
   };
   ```

   These values are not secret. The data is protected by the login and the rules from step 3.

5. Back in **Authentication > Settings > Authorized domains**, add `thehypehousegh.github.io`.

## 5. Turn on GitHub Pages

1. On GitHub, open the repository's **Settings > Pages**.
2. Under **Build and deployment > Source**, choose **GitHub Actions**.
3. Every push to `main` now builds and publishes the app. Check progress in the **Actions** tab.

The app will be at: https://thehypehousegh.github.io/Adwoaba-s-Lounge-/

## 6. Install on each phone

1. Open the link above on the phone, while connected to the internet.
2. Sign in with that staff member's email and password.
3. Install it:
   * **Android (Chrome):** tap the menu (three dots), then **Add to Home screen** or **Install app**.
   * **iPhone (Safari):** tap the Share button, then **Add to Home Screen**.
4. Open it from the home screen icon from now on.

After the first sign-in the app works without internet. Sales and stock changes made offline are saved on the phone and sync automatically once the phone is back online. The badge at the top shows **Synced**, **Syncing…** or **Offline**.

## 7. Load the 26 October stocktake

On one phone only, open **Stock** and tap **Load stocktake**. Then fill in prices from each product's page (pencil icon).
