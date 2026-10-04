// The vendored C++ grammar extends C, which is not included in Prism's core bundle.
export function ensurePrismC(prism) {
  prism.languages.c ??= prism.languages.extend('clike', {
    keyword: /\b(?:auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|inline|int|long|register|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while)\b/,
    macro: { pattern: /(^\s*)#\s*[a-z]+(?:.*\\(?:\r\n|\r|\n).+)*/m, lookbehind: true, alias: 'property' },
  });
}
