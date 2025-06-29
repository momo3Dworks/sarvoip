
"use client";

import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { auth, googleProvider, db } from '@/lib/firebase';
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  User as FirebaseUser,
  signInWithEmailAndPassword,
  signInWithRedirect
} from 'firebase/auth';
import { doc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';

interface User {
  uid: string;
  name: string | null;
}

interface UserContextType {
  user: User | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const UserContext = createContext<UserContextType>({
  user: null,
  loading: true,
  loginWithGoogle: async () => {},
  loginWithEmail: async () => {},
  logout: async () => {},
});

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        const name = firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Anonymous';
        const appUser: User = {
          uid: firebaseUser.uid,
          name: name,
        };
        // Ensure user's name is set in Firestore for display in lobby
        setDoc(doc(db, 'users', firebaseUser.uid), { name, status: 'online', last_seen: serverTimestamp() }, { merge: true });
        setUser(appUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    setLoading(true);
    try {
      if (isMobile) {
        await signInWithRedirect(auth, googleProvider);
      } else {
        await signInWithPopup(auth, googleProvider);
      }
    } catch (error: any) {
        console.error("Authentication error:", error);
        let description = 'Could not sign in with Google. Please try again.';
        
        if (error.code === 'auth/unauthorized-domain') {
          description = "This app's domain is not authorized for Google Sign-In. Please add it in your Firebase console's Authentication settings under 'Authorized domains'.";
        } else if (error.code === 'auth/popup-closed-by-user') {
          setLoading(false);
          return;
        }

        toast({
            variant: 'destructive',
            title: 'Authentication Error',
            description: description,
        });
        setLoading(false);
        throw error;
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (error: any) {
      console.error("Email authentication error:", error);
      let description = "An unexpected error occurred. Please try again.";
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
        description = "Invalid email or password. Please try again.";
      }
      toast({
        variant: 'destructive',
        title: 'Login Failed',
        description,
      });
      setLoading(false);
      throw error;
    }
  };

  const logout = async () => {
    if (auth.currentUser) {
      const userDocRef = doc(db, 'users', auth.currentUser.uid);
      try {
        await updateDoc(userDocRef, { status: 'offline', last_seen: serverTimestamp() });
      } catch (error) {
        console.warn("Could not update user status to offline on logout", error);
      }
    }
    await signOut(auth);
  };

  return (
    <UserContext.Provider value={{ user, loading, loginWithGoogle, loginWithEmail, logout }}>
      {children}
    </UserContext.Provider>
  );
};
