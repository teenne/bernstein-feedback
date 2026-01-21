/**
 * Firebase/Firestore Adapter for @bernstein/feedback
 *
 * Setup:
 * 1. npm install firebase
 * 2. Create a Firebase project and enable Firestore
 * 3. Configure your Firebase credentials
 *
 * Firestore Security Rules (example):
 * ```
 * rules_version = '2';
 * service cloud.firestore {
 *   match /databases/{database}/documents {
 *     match /feedback/{docId} {
 *       allow create: if true;  // Allow anyone to submit feedback
 *       allow read: if request.auth != null;  // Only authenticated users can read
 *     }
 *   }
 * }
 * ```
 */

import { initializeApp } from 'firebase/app'
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore'
import type { FeedbackAdapter, FeedbackEvent } from '@bernstein/feedback'

// Your Firebase config
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

export function firebaseAdapter(collectionName = 'feedback'): FeedbackAdapter {
  return {
    async send(event: FeedbackEvent) {
      const docRef = await addDoc(collection(db, collectionName), {
        projectId: event.projectId,
        type: event.type,
        form: {
          title: event.form.title,
          description: event.form.description,
          category: event.form.category,
          impact: event.form.impact,
          email: event.form.email,
        },
        context: event.context,
        screenshot: event.screenshot || null,
        highlightedElement: event.highlightedElement || null,
        userId: event.context?.userId || null,
        tenantId: event.context?.tenantId || null,
        clientTimestamp: event.timestamp,
        serverTimestamp: serverTimestamp(),
      })

      return { id: docRef.id }
    },
  }
}

// Usage:
// import { firebaseAdapter } from './adapters/firebase-adapter'
//
// <FeedbackProvider config={{ adapter: firebaseAdapter(), ... }}>
//
// Or with a custom collection name:
// <FeedbackProvider config={{ adapter: firebaseAdapter('user_feedback'), ... }}>
