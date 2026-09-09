const WORDS_DATABASE = {
  4: words4,
  5: words5,
  6: words6,
  7: words7
};

function getWordList(length) {
  return WORDS_DATABASE[length] || [];
}