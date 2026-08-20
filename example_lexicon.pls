<?xml version="1.0" encoding="UTF-8"?>
<!--
  Example lexicon showing the two substitution modes.

  <alias>  -> reading fix. The kana is substituted into the text directly.
              Nothing Fish-specific; works with any engine.

  <phoneme alphabet="x-fish-openjtalk">
           -> reading + pitch accent. Substituted as a phoneme tag.
              Use this where the reading is already correct but the accent
              is not — no respelling can express pitch.

  The contents are OpenJTalk romaji with a pitch digit after each
  vowel-bearing mora: 0 = low, 1 = high. Generate them from 読み + アクセント型
  with fromYomiAndAccent() in pls-to-fish.js.
-->
<lexicon version="1.0"
  xmlns="http://www.w3.org/2005/01/pronunciation-lexicon"
  alphabet="ipa" xml:lang="ja-JP">

  <!-- reading is wrong -> substitute kana -->
  <lexeme>
    <grapheme>内気循環</grapheme>
    <alias>ないきじゅんかん</alias>
  </lexeme>

  <!-- reading is right, accent is wrong -> substitute a tag -->
  <lexeme>
    <grapheme>橋</grapheme>
    <phoneme alphabet="x-fish-openjtalk">ha0shi1</phoneme>
  </lexeme>
  <lexeme>
    <grapheme>箸</grapheme>
    <phoneme alphabet="x-fish-openjtalk">ha1shi0</phoneme>
  </lexeme>

</lexicon>
