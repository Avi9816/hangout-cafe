import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

declare const __firebase_config: any;
declare const __initial_auth_token: any;

export let db: Firestore | null = null;
export let auth: Auth | null = null;

function parseConfig(str: string): any {
  try {
    return JSON.parse(str);
  } catch {
    try {
      return new Function(`return (${str})`)();
    } catch (e) {
      console.error("Failed to parse config string:", e);
      throw e;
    }
  }
}

export async function initFirebase(): Promise<Auth | null> {
  try {
    const config = typeof __firebase_config !== 'undefined' ? 
                   (typeof __firebase_config === 'string' ? parseConfig(__firebase_config) : __firebase_config) : 
                   ((import.meta.env && import.meta.env.VITE_FIREBASE_CONFIG) ?
                    parseConfig(import.meta.env.VITE_FIREBASE_CONFIG) :
                    { apiKey: "mock-api-key", projectId: "mock-project-id" });
                   
    // Idempotent initialization
    const app = getApps().length === 0 ? initializeApp(config) : getApp();
    auth = getAuth(app); 
    db = getFirestore(app);

    if (typeof window !== 'undefined' && import.meta.env.DEV) {
        (window as any).auth = auth;
        (window as any).db = db;
        (window as any).__firebase_config_value = (import.meta.env && import.meta.env.VITE_FIREBASE_CONFIG) ? import.meta.env.VITE_FIREBASE_CONFIG : null;
    }


    if (getApps().length === 1 && !auth.currentUser) {
        try {
            if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                await signInWithCustomToken(auth, __initial_auth_token);
            } else {
                await signInAnonymously(auth);
            }
        } catch (signInError: any) {
            console.warn("[FIREBASE_SIGNIN_ERROR]", signInError.code || signInError.message || signInError);
        }
    }

    return auth;
  } catch (e: any) {
    console.warn("Firebase offline or misconfigured", e.message || e);
    return null;
  }
}
