'use strict';

// DOS Genie uses a bundled, editable local knowledge base. No external Akinator API
// or member data is required. Traits are deliberately broad and game-oriented.
const QUESTIONS = [
  ['real', 'هل الشخصية حقيقية وليست خيالية؟'],
  ['fictional', 'هل الشخصية خيالية من فيلم أو مسلسل أو لعبة؟'],
  ['arab', 'هل الشخصية عربية؟'],
  ['male', 'هل الشخصية ذكر؟'],
  ['female', 'هل الشخصية أنثى؟'],
  ['footballer', 'هل الشخصية لاعب كرة قدم؟'],
  ['argentinian', 'هل هو أرجنتيني؟'],
  ['portuguese', 'هل هو برتغالي؟'],
  ['brazilian', 'هل هو برازيلي؟'],
  ['egyptian', 'هل هو مصري؟'],
  ['french', 'هل هو فرنسي؟'],
  ['norwegian', 'هل هو نرويجي؟'],
  ['singer', 'هل الشخصية مغنٍ أو مغنية؟'],
  ['actor', 'هل الشخصية ممثل أو ممثلة؟'],
  ['scientist', 'هل اشتهرت بالعلوم أو الاختراعات؟'],
  ['historical', 'هل هي شخصية تاريخية؟'],
  ['leader', 'هل هي قائد أو شخصية سياسية؟'],
  ['internet_famous', 'هل اشتهرت عبر الإنترنت أو يوتيوب؟'],
  ['content_creator', 'هل تشتهر بصناعة المحتوى والفيديوهات؟'],
  ['entrepreneur', 'هل هي رائدة أعمال أو مؤسسة شركات؟'],
  ['relativity', 'هل ترتبط بنظرية النسبية؟'],
  ['gravity', 'هل ارتبط اسمها بقوانين الجاذبية؟'],
  ['anime', 'هل تظهر في أنمي ياباني؟'],
  ['cartoon', 'هل تظهر في كرتون؟'],
  ['game_character', 'هل هي شخصية من لعبة فيديو؟'],
  ['superhero', 'هل هي بطل خارق؟'],
  ['animal', 'هل هي حيوان أو كائن غير بشري؟'],
  ['cat', 'هل الشخصية قط؟'],
  ['mouse', 'هل الشخصية فأر؟'],
  ['blocky', 'هل شكلها مكعب أو من عالم مكعبات؟'],
  ['demon_slayer', 'هل هي من أنمي قاتل الشياطين؟'],
  ['captain', 'هل هي قائد فرقة أو وحدة قتالية؟'],
  ['robot', 'هل هي روبوت أو آلة؟'],
  ['magical', 'هل تستخدم السحر أو قوى خارقة للطبيعة؟'],
  ['has_superpowers', 'هل لديها قدرات خارقة؟'],
  ['has_weapon', 'هل تستخدم سلاحاً مميزاً؟'],
  ['detective', 'هل تعمل كمحقق أو تحل الألغاز؟'],
  ['student', 'هل هي طالب أو طالبة؟'],
  ['pirate', 'هل هي قرصان؟'],
  ['yellow', 'هل لونها الأساسي أصفر؟'],
  ['wears_glasses', 'هل ترتدي نظارات غالباً؟'],
  ['wears_mask', 'هل تخفي وجهها بقناع؟'],
  ['from_space', 'هل أصلها من الفضاء؟'],
  ['has_companion', 'هل لديها رفيق أو صديق مشهور يرافقها؟'],
  ['basketballer', 'هل هي لاعب كرة سلة؟'],
  ['racer', 'هل تشتهر بالسباقات أو السرعة؟'],
  ['princess', 'هل هي أميرة؟'],
  ['has_mustache', 'هل لديها شارب واضح؟'],
  ['from_manga', 'هل أصلها من مانغا يابانية؟']
];

function entity(id, name, category, traits, description = '') {
  const values = Object.fromEntries(QUESTIONS.map(([key]) => [key, false]));
  for (const key of traits) values[key] = true;
  return { id, name, category, description, traits: values };
}

const ENTITIES = [
  entity('messi','ليونيل ميسي','رياضة',['real','male','footballer','argentinian']),
  entity('ronaldo','كريستيانو رونالدو','رياضة',['real','male','footballer','portuguese']),
  entity('neymar','نيمار','رياضة',['real','male','footballer','brazilian']),
  entity('salah','محمد صلاح','رياضة',['real','male','arab','footballer','egyptian']),
  entity('mbappe','كيليان مبابي','رياضة',['real','male','footballer','french']),
  entity('haaland','إيرلينغ هالاند','رياضة',['real','male','footballer','norwegian']),
  entity('taylor_swift','تايلور سويفت','فن',['real','female','singer']),
  entity('mrbeast','مستر بيست','إنترنت',['real','male','internet_famous','content_creator']),
  entity('elon_musk','إيلون ماسك','شخصيات عامة',['real','male','internet_famous','entrepreneur']),
  entity('einstein','ألبرت أينشتاين','تاريخ',['real','male','scientist','historical','wears_glasses','relativity']),
  entity('newton','إسحاق نيوتن','تاريخ',['real','male','scientist','historical','gravity']),
  entity('cleopatra','كليوباترا','تاريخ',['real','female','historical','leader']),
  entity('ibn_sina','ابن سينا','تاريخ',['real','male','arab','scientist','historical']),
  entity('salahuddin','صلاح الدين الأيوبي','تاريخ',['real','male','arab','historical','leader','has_weapon']),
  entity('sherlock','شيرلوك هولمز','أدب',['fictional','male','detective','wears_glasses']),
  entity('harry_potter','هاري بوتر','أفلام',['fictional','male','magical','has_superpowers','student','has_companion']),
  entity('spiderman','سبايدرمان','أبطال خارقون',['fictional','male','superhero','has_superpowers','wears_mask']),
  entity('batman','باتمان','أبطال خارقون',['fictional','male','superhero','wears_mask','detective','has_weapon']),
  entity('superman','سوبرمان','أبطال خارقون',['fictional','male','superhero','has_superpowers','from_space']),
  entity('iron_man','آيرون مان','أبطال خارقون',['fictional','male','superhero','has_superpowers','robot']),
  entity('captain_america','كابتن أمريكا','أبطال خارقون',['fictional','male','superhero','has_superpowers','has_weapon']),
  entity('wonder_woman','المرأة الخارقة','أبطال خارقون',['fictional','female','superhero','has_superpowers','has_weapon']),
  entity('elsa','إلسا','أفلام',['fictional','female','magical','has_superpowers','princess']),
  entity('shrek','شريك','أفلام',['fictional','male','animal','has_companion']),
  entity('spongebob','سبونج بوب','كرتون',['fictional','male','cartoon','animal','yellow','has_companion']),
  entity('patrick','بسيط نجم','كرتون',['fictional','male','cartoon','animal','has_companion']),
  entity('tom','توم','كرتون',['fictional','male','cartoon','animal','cat','has_companion']),
  entity('jerry','جيري','كرتون',['fictional','male','cartoon','animal','mouse','has_companion']),
  entity('mickey','ميكي ماوس','كرتون',['fictional','male','cartoon','animal','mouse','has_companion']),
  entity('doraemon','دورايمون','أنمي',['fictional','male','anime','cartoon','robot','has_companion']),
  entity('naruto','ناروتو','أنمي',['fictional','male','anime','from_manga','has_superpowers','has_weapon','student']),
  entity('sasuke','ساسكي','أنمي',['fictional','male','anime','from_manga','has_superpowers','has_weapon']),
  entity('goku','غوكو','أنمي',['fictional','male','anime','from_manga','has_superpowers','from_space']),
  entity('luffy','لوفي','أنمي',['fictional','male','anime','from_manga','has_superpowers','pirate','has_companion']),
  entity('zoro','زورو','أنمي',['fictional','male','anime','from_manga','has_weapon','pirate']),
  entity('pikachu','بيكاتشو','أنمي',['fictional','animal','anime','cartoon','yellow','has_superpowers']),
  entity('ash','آش كيتشام','أنمي',['fictional','male','anime','student','has_companion']),
  entity('tanjiro','تانجيرو','أنمي',['fictional','male','anime','from_manga','has_weapon','demon_slayer']),
  entity('nezuko','نيزوكو','أنمي',['fictional','female','anime','from_manga','has_superpowers']),
  entity('gojo','غوجو ساتورو','أنمي',['fictional','male','anime','from_manga','has_superpowers','wears_glasses']),
  entity('mario','ماريو','ألعاب',['fictional','male','game_character','has_mustache','has_companion']),
  entity('sonic','سونيك','ألعاب',['fictional','male','game_character','animal','racer','blue','has_companion']),
  entity('steve','ستيف ماينكرافت','ألعاب',['fictional','male','game_character','has_weapon','blocky']),
  entity('creeper','كريبر','ألعاب',['fictional','game_character','animal']),
  entity('link','لينك','ألعاب',['fictional','male','game_character','has_weapon','fantasy_hero']),
  entity('kratos','كريتوس','ألعاب',['fictional','male','game_character','has_weapon','has_superpowers']),
  entity('among_us','شخصية Among Us','ألعاب',['fictional','game_character','wears_mask']),
  entity('joker','الجوكر','أفلام',['fictional','male','detective']),
  entity('wednesday','وينزداي آدامز','مسلسلات',['fictional','female','student','magical']),
  entity('groot','غروت','أفلام',['fictional','male','animal','from_space','has_superpowers']),
  entity('minion','مينيون','أفلام',['fictional','male','cartoon','yellow','has_companion']),
  entity('garfield','غارفيلد','كرتون',['fictional','male','cartoon','animal']),
  entity('scooby','سكوبي دو','كرتون',['fictional','male','cartoon','animal','detective','has_companion']),
  entity('homer','هومر سيمبسون','كرتون',['fictional','male','cartoon','has_companion']),
  entity('light_yagami','لايت ياغامي','أنمي',['fictional','male','anime','from_manga','student']),
  entity('cinderella','سندريلا','أفلام',['fictional','female','princess','has_companion']),
  entity('popeye','باباي','كرتون',['fictional','male','cartoon','has_mustache','has_companion']),
  entity('buzz','باز يطير','أفلام',['fictional','male','from_space','has_companion']),
  entity('wall_e','وول إي','أفلام',['fictional','robot','from_space','has_companion']),
  entity('saitama','سايتاما','أنمي',['fictional','male','anime','from_manga','has_superpowers']),
  entity('levi','ليفاي أكرمان','أنمي',['fictional','male','anime','from_manga','has_weapon','captain']),
  entity('john_wick','جون ويك','أفلام',['fictional','male','has_weapon']),
  entity('jack_sparrow','جاك سبارو','أفلام',['fictional','male','pirate','has_weapon']),
  entity('mr_incredible','مستر إنكريدبل','أفلام',['fictional','male','superhero','has_superpowers','has_companion'])
];

function posterior(state) {
  const excluded = new Set(state.excluded || []);
  const active = ENTITIES.filter((item) => !excluded.has(item.id));
  const logScores = active.map((item) => {
    let log = 0;
    for (const [questionId, answer] of Object.entries(state.answers || {})) {
      const truth = item.traits[questionId] ? 1 : 0;
      const probability = answer === 'yes' ? (truth ? 0.92 : 0.08)
        : answer === 'probably_yes' ? (truth ? 0.72 : 0.28)
          : answer === 'probably_no' ? (truth ? 0.28 : 0.72)
            : answer === 'no' ? (truth ? 0.08 : 0.92) : 0.5;
      log += Math.log(probability);
    }
    return log;
  });
  if (!active.length) return [];
  const maxLog = Math.max(...logScores);
  const exps = logScores.map((score) => Math.exp(score - maxLog));
  const total = exps.reduce((sum, value) => sum + value, 0) || 1;
  return active.map((item, index) => ({ ...item, probability: exps[index] / total }))
    .sort((a, b) => b.probability - a.probability);
}

function binaryEntropy(probability) {
  const p = Math.min(1 - 1e-9, Math.max(1e-9, probability));
  return -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
}

function chooseQuestion(state) {
  const asked = new Set(state.asked || []);
  const ranked = posterior(state);
  if (ranked.length <= 1) return null;
  let best = null;
  for (const [id, prompt] of QUESTIONS) {
    if (asked.has(id)) continue;
    const yesProbability = ranked.reduce((sum, item) => sum + item.probability * (item.traits[id] ? 0.92 : 0.08), 0);
    const score = binaryEntropy(yesProbability);
    if (!best || score > best.score) best = { id, prompt, score };
  }
  return best;
}

function shouldGuess(state, maxQuestions = 15) {
  const ranked = posterior(state);
  if (!ranked.length) return true;
  if (ranked.length === 1) return true;
  if (Number(state.questions || 0) >= maxQuestions) return true;
  const questionsSinceLastGuess = Number(state.questions || 0) - Number(state.lastGuessQuestions ?? -2);
  return Number(state.questions || 0) >= 7 && questionsSinceLastGuess >= 2 && ranked[0].probability >= 0.43;
}

function bestGuess(state) {
  return posterior(state)[0] || null;
}

function questionById(id) {
  const item = QUESTIONS.find(([key]) => key === id);
  return item ? { id: item[0], prompt: item[1] } : null;
}

module.exports = { QUESTIONS, ENTITIES, posterior, chooseQuestion, shouldGuess, bestGuess, questionById };
