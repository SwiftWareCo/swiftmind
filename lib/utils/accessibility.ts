/**
 * Accessibility utilities for WCAG AA compliance
 */

import { useEffect, useRef } from "react";
import React from "react";

/**
 * Custom hook for managing focus on error states
 * Automatically moves focus to error elements when they appear
 */
export function useErrorFocus<T extends HTMLElement>(
  hasError: boolean
) {
  const errorRef = useRef<T>(null);

  useEffect(() => {
    if (hasError && errorRef.current) {
      // Small delay to ensure the error element is rendered
      setTimeout(() => {
        errorRef.current?.focus();
      }, 100);
    }
  }, [hasError]);

  return errorRef;
}

/**
 * Custom hook for announcing messages to screen readers
 * Uses aria-live regions for dynamic content updates
 */
export function useScreenReaderAnnouncement() {
  const announceRef = useRef<HTMLDivElement>(null);

  const announce = (message: string, priority: 'polite' | 'assertive' = 'polite') => {
    if (announceRef.current) {
      // Clear previous announcement
      announceRef.current.textContent = '';
      announceRef.current.setAttribute('aria-live', priority);
      
      // Set new announcement after a brief delay
      setTimeout(() => {
        if (announceRef.current) {
          announceRef.current.textContent = message;
        }
      }, 100);
    }
  };

  const AnnouncementRegion = () => 
    React.createElement("div", {
      ref: announceRef,
      "aria-live": "polite",
      "aria-atomic": "true",
      className: "sr-only"
    });

  return { announce, AnnouncementRegion };
}

/**
 * Custom hook for keyboard navigation support
 * Handles arrow keys, enter, and escape for interactive elements
 */
export function useKeyboardNavigation(options: {
  onEnter?: () => void;
  onEscape?: () => void;
  onArrowUp?: () => void;
  onArrowDown?: () => void;
}) {
  const handleKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'Enter':
        if (options.onEnter) {
          event.preventDefault();
          options.onEnter();
        }
        break;
      case 'Escape':
        if (options.onEscape) {
          event.preventDefault();
          options.onEscape();
        }
        break;
      case 'ArrowUp':
        if (options.onArrowUp) {
          event.preventDefault();
          options.onArrowUp();
        }
        break;
      case 'ArrowDown':
        if (options.onArrowDown) {
          event.preventDefault();
          options.onArrowDown();
        }
        break;
    }
  };

  return { handleKeyDown };
}

/**
 * Generates unique IDs for form elements and their associated labels/descriptions
 */
export function useFormFieldIds(baseId: string) {
  return {
    fieldId: baseId,
    labelId: `${baseId}-label`,
    errorId: `${baseId}-error`,
    descriptionId: `${baseId}-description`,
    helpId: `${baseId}-help`
  };
}

/**
 * Validates color contrast ratios (basic check)
 * Helps ensure WCAG AA compliance for color choices
 */
export function getContrastRatio(foreground: string, background: string): number {
  // This is a simplified implementation
  // In production, you'd want a more robust color contrast calculation
  
  const getLuminance = (color: string) => {
    // Convert hex to RGB and calculate relative luminance
    // This is a basic implementation - use a proper library for production
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;
    
    const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  };

  const l1 = getLuminance(foreground);
  const l2 = getLuminance(background);
  
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Checks if contrast ratio meets WCAG AA standards
 */
export function meetsWCAGAA(contrastRatio: number, isLargeText = false): boolean {
  return isLargeText ? contrastRatio >= 3 : contrastRatio >= 4.5;
}

/**
 * Focus trap utility for modal dialogs and overlays
 */
export function useFocusTrap(isActive: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ) as NodeListOf<HTMLElement>;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Allow components to handle escape by dispatching a custom event
        container.dispatchEvent(new CustomEvent('escape-pressed'));
      }
    };

    // Set initial focus
    firstElement?.focus();

    // Add event listeners
    document.addEventListener('keydown', handleTabKey);
    document.addEventListener('keydown', handleEscapeKey);

    return () => {
      document.removeEventListener('keydown', handleTabKey);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isActive]);

  return containerRef;
}

/**
 * Reduced motion preference hook
 * Respects user's prefers-reduced-motion setting
 */
export function useReducedMotion(): boolean {
  const prefersReducedMotion = 
    typeof window !== 'undefined' && 
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  return prefersReducedMotion;
}
