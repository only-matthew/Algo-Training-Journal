export const mathDelimiters = [
  { left: '$$', right: '$$', display: true },
  { left: '\\[', right: '\\]', display: true },
  { left: '\\(', right: '\\)', display: false },
  { left: '$', right: '$', display: false },
];

export function containsMath(text = '') {
  return /\$|\\\(|\\\[/.test(text);
}
