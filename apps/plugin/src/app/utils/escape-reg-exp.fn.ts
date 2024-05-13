/**
 * Ensure the given string can be used safely as part of a RegExp
 * Reference: https://stackoverflow.com/questions/3115150/how-to-escape-regular-expression-special-characters-using-javascript
 * @param text
 */
export function escapeRegExp(text: string) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}
