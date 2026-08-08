import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merges Tailwind class names, later ones winning over earlier ones. */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
