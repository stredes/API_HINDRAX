import { getApp, getApps, initializeApp } from "firebase/app";

export const firebaseConfig = {
  apiKey: "AIzaSyDyHoipuU2xcKpnuaWH3xDWVCaWqiQ-Ta4",
  authDomain: "hindrax.firebaseapp.com",
  projectId: "hindrax",
  storageBucket: "hindrax.firebasestorage.app",
  messagingSenderId: "415212966678",
  appId: "1:415212966678:web:08035c286f78434345b637",
  measurementId: "G-THX834G42P"
};

export const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export async function getFirebaseAnalytics() {
  if (typeof window === "undefined") {
    return null;
  }

  const { getAnalytics, isSupported } = await import("firebase/analytics");
  return (await isSupported()) ? getAnalytics(firebaseApp) : null;
}
