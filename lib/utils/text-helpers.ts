/**
 * Utility functions for text processing and confirmation in conversational flows
 */

/**
 * Spells out a text string letter by letter for clear confirmation
 * @param text - The text to spell out (e.g., "Laine" or "Mac Leod")
 * @returns Spelled out text (e.g., "L. A. I. N. E." or "M. A. C. L. E. O. D.")
 */
export function spellOut(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  return text
    .replace(/\s+/g, '') // Remove all spaces first
    .split('')
    .filter(char => /[a-zA-Z]/.test(char)) // Only include letters
    .map(char => char.toUpperCase())
    .join('. ') + '.';
}

/**
 * Formats a phone number for clear read-back with pauses
 * @param phone - Phone number string (e.g., "5123341212")
 * @returns Formatted phone string (e.g., "5 1 2... 3 3 4... 1 2 1 2")
 */
export function formatPhoneNumberForReadback(phone: string): string {
  if (!phone || typeof phone !== 'string') {
    return '';
  }
  
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  // For 10-digit US numbers, format as: XXX... XXX... XXXX
  if (digits.length === 10) {
    const areaCode = digits.slice(0, 3).split('').join(' ');
    const exchange = digits.slice(3, 6).split('').join(' ');
    const number = digits.slice(6).split('').join(' ');
    return `${areaCode}... ${exchange}... ${number}`;
  }
  
  // For 11-digit numbers (with country code), format as: X... XXX... XXX... XXXX
  if (digits.length === 11) {
    const countryCode = digits.slice(0, 1);
    const areaCode = digits.slice(1, 4).split('').join(' ');
    const exchange = digits.slice(4, 7).split('').join(' ');
    const number = digits.slice(7).split('').join(' ');
    return `${countryCode}... ${areaCode}... ${exchange}... ${number}`;
  }
  
  // For other lengths, just space out all digits
  return digits.split('').join(' ');
} 