import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db, googleAuthProvider } from '../lib/firebase';
import { PortalSession, UserProfile, UserRole } from '../types';

const BOOTSTRAP_ADMIN_EMAIL = 'richardagbobli6@gmail.com';
const DEFAULT_SCHOOL_ID = 'sch_akromah_ridge';

function normalizeUserRole(rawRole: unknown, email?: string | null): UserRole {
  if (rawRole === 'Super Administrator') return 'School Administrator';
  if (rawRole === 'Admin') {
    return email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL
      ? 'School Administrator'
      : 'Pending';
  }
  const validRoles: ReadonlySet<string> = new Set([
    'School Administrator',
    'Headteacher',
    'Class Teacher',
    'Subject Teacher',
    'Academic Coordinator',
    'Parent',
    'Pending',
  ]);
  if (typeof rawRole === 'string' && validRoles.has(rawRole)) {
    return rawRole as UserRole;
  }
  return 'Pending';
}

interface AuthContextValue {
  firebaseUser: User | null;
  portalSession: PortalSession | null;
  profile: UserProfile | null;
  effectiveRole: UserRole;
  previewRole: UserRole | null;
  setPreviewRole: (role: UserRole | null) => void;
  activeSchoolId: string;
  setActiveSchoolId: (schoolId: string) => void;
  authReady: boolean;
  authError: string | null;
  autoLogoutNotice: string | null;
  clearAuthError: () => void;
  clearAutoLogoutNotice: () => void;
  signInWithGoogle: () => Promise<void>;
  signInAsSchoolAdmin: (params: { email: string; password: string }) => Promise<boolean>;
  signInWithEmail: (params: { email: string; password: string }) => Promise<boolean>;
  bootstrapSchoolAdmin: (params: { email: string; password: string }) => Promise<boolean>;
  replacePortalSession: (session: PortalSession) => void;
  signInUnified: (params: {
    identifier: string;
    schoolId: string;
    password: string;
    credentialKind?: 'school_code' | 'parent';
  }) => Promise<boolean>;
  signInAsClassTeacher: (params: {
    schoolId: string;
    classId?: string;
    teacherId?: string;
    password: string;
  }) => Promise<boolean>;
  signInAsJhsTeacher: (params: {
    schoolId: string;
    teacherPassword: string;
  }) => Promise<boolean>;
  signInAsParent: (params: {
    schoolId: string;
    admissionNumber: string;
    password: string;
  }) => Promise<boolean>;
  signOut: (options?: { reason?: 'manual' | 'inactivity' }) => Promise<void>;
  getIdToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [firebaseProfile, setFirebaseProfile] = useState<UserProfile | null>(null);
  const [portalSession, setPortalSession] = useState<PortalSession | null>(null);
  const [previewRole, setPreviewRole] = useState<UserRole | null>(null);
  const [activeSchoolId, setActiveSchoolId] = useState<string>(DEFAULT_SCHOOL_ID);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [autoLogoutNotice, setAutoLogoutNotice] = useState<string | null>(null);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      setFirebaseUser(user);
      setPreviewRole(null);

      if (!user) {
        setFirebaseProfile(null);
        setAuthReady(true);
        return;
      }

      // Strictly enforce Google Sign-In allowlist: ONLY richardagbobli6@gmail.com (verified)
      const isAuthorizedSchoolAdminGoogle =
        user.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL && user.emailVerified;
      if (!isAuthorizedSchoolAdminGoogle) {
        setFirebaseUser(null);
        setFirebaseProfile(null);
        setAuthError(
          'Access Denied: you are not authorize to use google sign in'
        );
        setAuthReady(true);
        void firebaseSignOut(auth);
        return;
      }

      const userDocRef = doc(db, 'users', user.uid);
      unsubProfile = onSnapshot(
        userDocRef,
        async (snap) => {
          if (!snap.exists()) {
            const now = new Date().toISOString();
            const newProfile: UserProfile = {
              uid: user.uid,
              email: user.email || '',
              displayName: user.displayName || user.email?.split('@')[0] || 'School Administrator',
              role: 'School Administrator',
              assignedClassIds: [],
              assignedSubjectIds: [],
              isActive: true,
              createdAt: now,
              updatedAt: now,
            };
            try {
              await setDoc(userDocRef, newProfile);
              setFirebaseProfile(newProfile);
            } catch (err) {
              console.error(`Firestore Error [create users/${user.uid}]:`, err);
              setAuthError(
                err instanceof Error ? err.message : 'Unable to initialize your user profile.'
              );
            }
          } else {
            const rawData = snap.data() as UserProfile & { role?: unknown };
            setFirebaseProfile({
              ...rawData,
              role: normalizeUserRole(rawData.role, rawData.email || user.email),
            });
          }
          setAuthReady(true);
        },
        (err) => {
          console.error(`Firestore Error [get users/${user.uid}]:`, err);
          setAuthError(
            err instanceof Error ? err.message : 'Unable to load your user profile.'
          );
          setAuthReady(true);
        }
      );
    });

    return () => {
      unsubAuth();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  useEffect(() => {
    if (portalSession?.schoolId) return;
    let cancelled = false;
    void fetch('/api/public/portal-info')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.schoolId === 'string' && data.schoolId) {
          setActiveSchoolId(data.schoolId);
        }
      })
      .catch(() => {
        // Ignore network errors on initial school ID resolution
      });
    return () => {
      cancelled = true;
    };
  }, [portalSession?.schoolId]);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
    setAutoLogoutNotice(null);
  }, []);

  const clearAutoLogoutNotice = useCallback(() => {
    setAutoLogoutNotice(null);
  }, []);

  const signInWithGoogle = async () => {
    setAuthError(null);
    setAutoLogoutNotice(null);
    setPortalSession(null);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const signedEmail = cred.user.email?.toLowerCase() || '';
      if (signedEmail !== BOOTSTRAP_ADMIN_EMAIL || !cred.user.emailVerified) {
        await firebaseSignOut(auth);
        setFirebaseUser(null);
        setFirebaseProfile(null);
        setAuthError(
          'Access Denied: you are not authorize to use google sign in'
        );
        return;
      }
      // Record verified Google sign-in in server security log & clear any failed lockout
      try {
        const idToken = await cred.user.getIdToken();
        await fetch('/api/auth/school-admin-google-verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
        });
      } catch {
        // Non-blocking audit log notification
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in could not be completed.';
      setAuthError(msg);
    }
  };

  const signInAsSchoolAdmin = async (params: {
    email: string;
    password: string;
  }): Promise<boolean> => {
    setAuthError(null);
    setAutoLogoutNotice(null);
    try {
      const res = await fetch('/api/auth/school-admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: params.email.trim(),
          password: params.password,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.session) {
        setAuthError(
          json.error || 'Invalid School Administrator email or password.'
        );
        return false;
      }
      const session = json.session as PortalSession;
      if (auth.currentUser) {
        await firebaseSignOut(auth);
      }
      setPreviewRole(null);
      setPortalSession(session);
      setActiveSchoolId(session.schoolId || DEFAULT_SCHOOL_ID);
      return true;
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Network error during sign-in.');
      return false;
    }
  };

  const signInWithEmail = async (params: {
    email: string;
    password: string;
  }): Promise<boolean> => {
    setAuthError(null);
    setAutoLogoutNotice(null);
    try {
      const res = await fetch('/api/auth/email-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: params.email.trim(),
          password: params.password,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.session) {
        setAuthError(json.error || 'Incorrect School Administrator email or password.');
        return false;
      }
      const session = json.session as PortalSession;
      if (auth.currentUser) {
        await firebaseSignOut(auth);
      }
      setPreviewRole(null);
      setPortalSession(session);
      setActiveSchoolId(session.schoolId || DEFAULT_SCHOOL_ID);
      return true;
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Network error during sign-in.');
      return false;
    }
  };

  const bootstrapSchoolAdmin = async (params: {
    email: string;
    password: string;
  }): Promise<boolean> => {
    setAuthError(null);
    setAutoLogoutNotice(null);
    try {
      const res = await fetch('/api/auth/school-admin-bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: params.email.trim(),
          password: params.password,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.session) {
        setAuthError(json.error || 'Could not initialize School Administrator password.');
        return false;
      }
      const session = json.session as PortalSession;
      if (auth.currentUser) {
        await firebaseSignOut(auth);
      }
      setPreviewRole(null);
      setPortalSession(session);
      setActiveSchoolId(session.schoolId || DEFAULT_SCHOOL_ID);
      return true;
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Network error during initialization.');
      return false;
    }
  };

  const replacePortalSession = useCallback((session: PortalSession) => {
    setPortalSession(session);
  }, []);

  const performPortalLogin = async (payload: Record<string, unknown>): Promise<boolean> => {
    setAuthError(null);
    setAutoLogoutNotice(null);
    try {
      const res = await fetch('/api/auth/school-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.session) {
        setAuthError(json.error || 'Sign-in failed. Please verify your code and password.');
        return false;
      }
      const session = json.session as PortalSession;
      if (auth.currentUser) {
        await firebaseSignOut(auth);
      }
      setPreviewRole(null);
      setPortalSession(session);
      setActiveSchoolId(session.schoolId || DEFAULT_SCHOOL_ID);
      return true;
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Network error during sign-in.');
      return false;
    }
  };

  const signInUnified = async (params: {
    identifier: string;
    schoolId: string;
    password: string;
    credentialKind?: 'school_code' | 'parent';
  }): Promise<boolean> => {
    setAuthError(null);
    setAutoLogoutNotice(null);
    try {
      const res = await fetch('/api/auth/unified-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: params.identifier.trim(),
          schoolId: params.schoolId,
          password: params.password,
          credentialKind: params.credentialKind,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.session) {
        setAuthError(json.error || 'Sign-in failed. Please verify your credentials and password.');
        return false;
      }
      const session = json.session as PortalSession;
      if (auth.currentUser) {
        await firebaseSignOut(auth);
      }
      setPreviewRole(null);
      setPortalSession(session);
      setActiveSchoolId(session.schoolId || DEFAULT_SCHOOL_ID);
      return true;
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Network error during sign-in.');
      return false;
    }
  };

  const signInAsClassTeacher = async (params: {
    schoolId: string;
    classId?: string;
    teacherId?: string;
    password: string;
  }) =>
    performPortalLogin({
      schoolId: params.schoolId,
      loginType: 'class_teacher',
      classId: params.classId || '',
      teacherId: params.teacherId || '',
      password: params.password,
    });

  const signInAsJhsTeacher = async (params: {
    schoolId: string;
    teacherPassword: string;
  }) =>
    performPortalLogin({
      schoolId: params.schoolId,
      loginType: 'jhs_teacher',
      teacherPassword: params.teacherPassword,
    });

  const signInAsParent = async (params: {
    schoolId: string;
    admissionNumber: string;
    password: string;
  }) =>
    performPortalLogin({
      schoolId: params.schoolId,
      loginType: 'parent',
      admissionNumber: params.admissionNumber.trim(),
      password: params.password,
    });

  const signOut = useCallback(async (options?: { reason?: 'manual' | 'inactivity' }) => {
    setPreviewRole(null);
    setPortalSession(null);
    setAuthError(null);
    setAutoLogoutNotice(
      options?.reason === 'inactivity'
        ? 'You were signed out automatically after 30 minutes of inactivity to protect your account on shared computers.'
        : null
    );
    if (auth.currentUser) {
      await firebaseSignOut(auth);
    }
  }, []);

  const getIdToken = useCallback(async (): Promise<string> => {
    if (portalSession?.token) {
      return portalSession.token;
    }
    if (!auth.currentUser) throw new Error('Not authenticated');
    return auth.currentUser.getIdToken();
  }, [portalSession]);

  // Synthesize unified UserProfile whether signed in via Portal Session or Google School Admin
  const profile: UserProfile | null = portalSession
    ? {
        uid:
          portalSession.sessionType === 'school_admin'
            ? 'school_admin_portal'
            : portalSession.pupilId
            ? `parent_${portalSession.pupilId}`
            : portalSession.teacherId || `${portalSession.sessionType}_${portalSession.schoolId}`,
        email: portalSession.email || '',
        displayName: portalSession.displayName,
        role: portalSession.role,
        schoolId: portalSession.schoolId,
        pupilId: portalSession.pupilId,
        admissionNumber: portalSession.admissionNumber,
        assignedClassIds: portalSession.assignedClassIds,
        assignedSubjectIds: portalSession.assignedSubjectIds,
        jhsAssignments: portalSession.jhsAssignments,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    : firebaseProfile;

  const actualRole: UserRole = profile?.role || 'Pending';
  const effectiveRole: UserRole =
    actualRole === 'School Administrator' && previewRole ? previewRole : actualRole;

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        portalSession,
        profile,
        effectiveRole,
        previewRole,
        setPreviewRole,
        activeSchoolId: portalSession?.schoolId || activeSchoolId,
        setActiveSchoolId,
        authReady,
        authError,
        autoLogoutNotice,
        clearAuthError,
        clearAutoLogoutNotice,
        signInWithGoogle,
        signInAsSchoolAdmin,
        signInWithEmail,
        bootstrapSchoolAdmin,
        replacePortalSession,
        signInUnified,
        signInAsClassTeacher,
        signInAsJhsTeacher,
        signInAsParent,
        signOut,
        getIdToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
