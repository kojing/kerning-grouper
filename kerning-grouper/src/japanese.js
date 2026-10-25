// Deliberately bounded sample, not a complete Japanese repertoire.
export const japaneseText='あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんがぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽぁぃぅぇぉゃゅょっアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポァィゥェォャュョッー。、・「」『』（）！？：；';
export const japaneseReferences='のの ねね カカ ロロ のカ カの のロ ロの';
export const japanesePreview='ひらがなとカタカナのカーニング';
export const japaneseSample=[...new Set(japaneseText+''+japanesePreview)].join('');
