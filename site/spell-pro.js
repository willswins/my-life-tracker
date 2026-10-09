// Professional words for Spell It — appended to SPELL_WORDS at runtime
(function() {
  function addWords() {
    if (typeof SPELL_WORDS === 'undefined') { setTimeout(addWords, 200); return; }
    SPELL_WORDS.simple.push('email','meeting','office','report','client','agenda','brief','draft','inbox','memo','noise');
    SPELL_WORDS.medium.push('colleague','deadline','minutes','briefing','stakeholder','deliverable','milestone','procurement','compliance','review','feedback','update','action','owner','blocker');
    SPELL_WORDS.complex.push('entrepreneur','bureaucracy','reconciliation','liaison','infrastructure','architecture','implementation','stakeholder','prioritize','escalation');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addWords);
  else addWords();
})();
