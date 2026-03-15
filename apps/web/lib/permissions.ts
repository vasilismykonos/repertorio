// apps/web/lib/permissions.ts
import type { UserRole } from "@/lib/currentUser";

export const SONG_CREATE_ROLES: UserRole[] = [
  "ADMIN",
  "AUTHOR",
  "CONTRIBUTOR",
  "SUBSCRIBER",
];

export const SONG_EDIT_ROLES: UserRole[] = [
  "ADMIN",
  "EDITOR",
  "AUTHOR",
];

export function canCreateSong(role?: UserRole | null): boolean {
  return !!role && SONG_CREATE_ROLES.includes(role);
}

export function canEditSongByRole(role?: UserRole | null): boolean {
  return !!role && SONG_EDIT_ROLES.includes(role);
}

export function canChangeSongStatus(role?: UserRole | null): boolean {
  return role === "ADMIN";
}

export function canChangeSongCreator(role?: UserRole | null): boolean {
  return role === "ADMIN";
}