// Professional-setting seed questions — appended to GRAMMAR_QS
(function() {
  function addQs() {
    if (typeof GRAMMAR_QS === 'undefined') { setTimeout(addQs, 200); return; }
    const pro = {
      simple: [
        ["Which is correct? (email)",
          ["Please find attached the report", "Please find the attached report", "Please find attach the report", "Please find attaching the report"],
          1, "seed"],
        ["Which is correct? (meeting)",
          ["Let's touch base tomorrow", "Let's touch bases tomorrow", "Let's touch basis tomorrow", "Let's touched base tomorrow"],
          0, "seed"],
        ["Which is correct?",
          ["Me and John will attend", "John and I will attend", "John and me will attend", "Me and John will attends"],
          1, "seed"],
        ["Which is correct?",
          ["Between you and I", "Between you and me", "Between you and myself", "Between I and you"],
          1, "seed"],
      ],
      medium: [
        ["Which is correct? (email)",
          ["As per your email, we will proceed", "Per your email, we will proceed", "As per your mail, we will proceed", "Per your email, we shall be proceeding"],
          1, "seed"],
        ["Which is correct?",
          ["Please revert back by Friday", "Please revert by Friday", "Please revert back on Friday", "Please be reverting by Friday"],
          1, "seed"],
        ["Which is correct?",
          ["We need to discuss about the timeline", "We need to discuss the timeline", "We need to discussion the timeline", "We need discussing about the timeline"],
          1, "seed"],
        ["Which is correct?",
          ["I would appreciate if you could review", "I will appreciate if you could review", "I would appreciated if you could review", "I appreciate if you would could review"],
          0, "seed"],
        ["Which is correct?",
          ["The affect of the change was minimal", "The effect of the change was minimal", "The affects of the change was minimal", "The effect of the change were minimal"],
          1, "seed"],
        ["Which is correct?",
          ["This will ensure compliance", "This will insure compliance", "This will ensures compliance", "This will ensuring compliance"],
          0, "seed"],
      ],
      complex: [
        ["Which is correct?",
          ["The principal reason is cost", "The principle reason is cost", "The principals reason is cost", "The principle reasons is cost"],
          0, "seed"],
        ["Which is correct?",
          ["She paid him a compliment on the deck", "She paid him a complement on the deck", "She paid him a compliments on the deck", "She payed him a compliment on the deck"],
          0, "seed"],
        ["Which is correct?",
          ["The data needs to be reconciled before Friday", "The data need to be reconciled before Friday", "The data needs to be reconcile before Friday", "The datas need to be reconciled before Friday"],
          0, "seed"],
        ["Which is correct?",
          ["Stakeholder feedback has been incorporated", "Stakeholders feedback has been incorporated", "Stakeholder feedback have been incorporated", "Stakeholder's feedback has being incorporated"],
          0, "seed"],
      ],
    };
    for (const level of ['simple', 'medium', 'complex']) {
      if (GRAMMAR_QS[level] && pro[level]) GRAMMAR_QS[level].push(...pro[level]);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addQs);
  else addQs();
})();
