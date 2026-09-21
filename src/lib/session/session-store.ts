"use client";

import { useSyncExternalStore } from "react";
import type { AuditEvent, Persona, UiLanguage } from "@/types/content";
import {
  createInitialSession,
  reduceSession,
  type Session,
  type SessionEvent,
} from "./state-machine";

// A tiny external store around the pure reducer. The reducer stays the single
// source of truth; the store only holds the value, notifies React, and persists
// the non-sensitive bits the caregiver view needs.
//
//  - sessionStorage: redacted audit events, persona, call counter
//  - localStorage:   language preference (contract §5: UI preferences only)
//
// Raw typed text, images and the candidate are never persisted.

const SESSION_KEY = "mc.session.v1";
const LANGUAGE_KEY = "mc.language.v1";

const SERVER_SNAPSHOT: Session = createInitialSession();

let current: Session = createInitialSession();
let hydrated = false;
const listeners = new Set<() => void>();

type Persisted = {
  persona: Persona;
  callCount: number;
  auditSeq: number;
  audit: AuditEvent[];
};

function isLanguage(v: unknown): v is UiLanguage {
  return v === "en" || v === "zh-Hans";
}

function hydrate(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Persisted>;
      if (
        Array.isArray(p.audit) &&
        p.audit.every((e) => typeof e?.id === "string" && typeof e?.eventType === "string") &&
        typeof p.auditSeq === "number" &&
        typeof p.callCount === "number" &&
        (p.persona === "mei-ling" || p.persona === "caregiver")
      ) {
        current = {
          ...current,
          persona: p.persona,
          callCount: p.callCount,
          auditSeq: p.auditSeq,
          audit: p.audit,
        };
      }
    }
  } catch {
    /* storage blocked or corrupt — start clean */
  }
  try {
    const lang = window.localStorage.getItem(LANGUAGE_KEY);
    if (isLanguage(lang)) current = { ...current, language: lang };
  } catch {
    /* ignore */
  }
}

function persist(prev: Session, next: Session): void {
  try {
    if (
      prev.audit !== next.audit ||
      prev.persona !== next.persona ||
      prev.callCount !== next.callCount
    ) {
      const payload: Persisted = {
        persona: next.persona,
        callCount: next.callCount,
        auditSeq: next.auditSeq,
        audit: next.audit,
      };
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    }
    if (prev.language !== next.language) {
      window.localStorage.setItem(LANGUAGE_KEY, next.language);
    }
  } catch {
    /* non-fatal: the app works without persistence */
  }
}

export const sessionStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot(): Session {
    hydrate();
    return current;
  },
  getServerSnapshot(): Session {
    return SERVER_SNAPSHOT;
  },
  dispatch(event: SessionEvent): void {
    hydrate();
    const next = reduceSession(current, event, { now: new Date().toISOString() });
    if (next === current) return; // guarded/blocked transition
    const prev = current;
    current = next;
    persist(prev, next);
    listeners.forEach((l) => l());
  },
  /** Test helper. */
  reset(): void {
    current = createInitialSession();
    hydrated = true;
    listeners.forEach((l) => l());
  },
};

export function useSession(): Session {
  return useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.getSnapshot,
    sessionStore.getServerSnapshot,
  );
}

export const dispatch = sessionStore.dispatch;
