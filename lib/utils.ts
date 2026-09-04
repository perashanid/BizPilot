import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merges conditional class names and resolves Tailwind class conflicts. Use this everywhere. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
