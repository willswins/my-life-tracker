// Spelling Bee patches: Clear button, zoom fix, expanded words
(function() {
'use strict';
function applyPatches() {
  var delBtn = document.getElementById('bee-delete');
  if (delBtn && delBtn.textContent === 'Delete') delBtn.textContent = 'Clear';
  if (!document.getElementById('bee-patch-css')) {
    var style = document.createElement('style');
    style.id = 'bee-patch-css';
    style.textContent = '.bee-actions button, .bee-tile { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }';
    document.head.appendChild(style);
  }
  if (typeof window.beeDelete !== 'undefined') {
    window.beeDelete = function() {
      if (typeof beeCur !== 'undefined') { beeCur = ''; if (typeof beeRender === 'function') beeRender(); }
    };
    if (delBtn && !delBtn._patchBound) {
      delBtn._patchBound = true;
      var newBtn = delBtn.cloneNode(true);
      newBtn.textContent = 'Clear';
      delBtn.parentNode.replaceChild(newBtn, delBtn);
      newBtn.addEventListener('click', window.beeDelete);
    }
  }
  var EXTRA = "serene tranquil meadow brook blossom petal thunder lightning rainbow dewdrop frost snowflake breeze gust storm cloud mist fog dawn dusk twilight ember flame spark ash smoke savory sweet bitter sour spicy tangy aroma feast banquet craving recipe simmer roast bake grill steam joyful merry cheerful gloomy dreary anxious calm brave bold clever witty kind gentle fierce proud humble eager keen vivid bright dim glow shine shimmer sparkle gleam lunar solar stellar comet orbit planet galaxy nebula atom molecule oxygen carbon iron gold silver copper quantum pulse wave ridge valley peak cliff canyon desert oasis jungle forest grove trail path bridge tower castle village city town harbor port ship sail anchor voyage quest journey wander roam explore discover invent create build craft paint draw sing dance play laugh smile grin frown sigh whisper shout speak talk listen hear see watch look gaze stare dream hope wish want need love hate fear dread courage valor honor glory shame guilt regret sorry thank praise blame fault error trial test quiz exam study learn teach coach mentor guide lead follow serve help aid cure heal mend fix break smash crash crack split tear rip cut slice dice chop mince grind pound knead whisk stir pour spill drip drop splash spray boil freeze melt thaw warm cool chill ice snow rain hail sleet gale wind air breath gasp pant yawn sneeze cough sob wail moan groan grunt hum chant cheer clap stomp tap knock rap thump bang boom blast pop snap click tick tock ring chime bell gong drum horn flute piano violin guitar harp lyre lute banjo fiddle cello bass viola oboe clarinet sax trumpet trombone tuba".split(" ");
  if (typeof window.beeNewPuzzle !== 'undefined' && !window._beePatchWrapped) {
    window._beePatchWrapped = true;
    var orig = window.beeNewPuzzle;
    window.beeNewPuzzle = function() { orig(); addExtraWords(); };
    setTimeout(addExtraWords, 500);
  }
  function addExtraWords() {
    try {
      if (typeof beeLetters !== 'undefined' && beeLetters.length > 0 && typeof beeCenter !== 'undefined' && typeof beeValid !== 'undefined') {
        var set = new Set(beeLetters);
        EXTRA.forEach(function(w) {
          if (w.indexOf(beeCenter) !== -1 && w.split('').every(function(ch) { return set.has(ch); })) beeValid.add(w);
        });
      }
    } catch (e) {}
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { setTimeout(applyPatches, 1500); });
else setTimeout(applyPatches, 1500);
})();
