const WORDS_DATABASE = {
  4: [words4, words4valid],
  5: [words5, words5valid],
  6: [words6, words6valid],
  7: [words7, words7valid]
};

function getWordList(length) {
  return WORDS_DATABASE[length] || [];
}