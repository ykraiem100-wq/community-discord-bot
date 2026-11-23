'use strict';
const assert = require('node:assert/strict');
const genie = require('../src/genie-engine');

assert.ok(genie.ENTITIES.length >= 50, 'The genie knowledge base should have at least 50 characters.');
assert.ok(genie.QUESTIONS.length >= 25, 'The genie should have a varied question bank.');
assert.equal(new Set(genie.ENTITIES.map((item) => item.id)).size, genie.ENTITIES.length, 'Character IDs must be unique.');
assert.equal(new Set(genie.QUESTIONS.map(([id]) => id)).size, genie.QUESTIONS.length, 'Question IDs must be unique.');
const state = { asked: [], answers: {}, excluded: [], questions: 0, guesses: 0 };
assert.equal(genie.shouldGuess(state, 15), false, 'The genie must not guess before asking questions.');
const first = genie.chooseQuestion(state);
assert.ok(first && first.id && first.prompt, 'The genie should choose an informative first question.');
state.asked.push(first.id);
state.answers[first.id] = 'yes';
state.questions += 1;
const second = genie.chooseQuestion(state);
assert.ok(second && second.id !== first.id, 'The genie must not repeat a question.');
const ranked = genie.posterior(state);
assert.equal(ranked.length, genie.ENTITIES.length);
assert.ok(Math.abs(ranked.reduce((sum, item) => sum + item.probability, 0) - 1) < 1e-9, 'Candidate probabilities should sum to one.');
assert.ok(genie.bestGuess(state).id, 'The genie must be able to produce a candidate guess.');
assert.equal(genie.shouldGuess({ ...state, questions: 15 }, 15), true, 'The configured question limit should force a guess.');
const excludedState = { ...state, excluded: [genie.bestGuess(state).id] };
assert.notEqual(genie.bestGuess(excludedState).id, genie.bestGuess(state).id, 'A rejected guess must be excluded from future guesses.');
// Perfect-answer simulation across the full bundled roster. It mirrors the in-game
// flow: max questions, up to three guesses, and no further questions after the cap.
let simulatedWins = 0;
for (const target of genie.ENTITIES) {
  const game = { asked: [], answers: {}, excluded: [], questions: 0, guesses: 0, lastGuessQuestions: -2 };
  let won = false;
  for (let turn = 0; turn < 50; turn += 1) {
    if (genie.shouldGuess(game, 15)) {
      const guess = genie.bestGuess(game);
      if (!guess) break;
      if (guess.id === target.id) { won = true; break; }
      game.excluded.push(guess.id);
      game.guesses += 1;
      game.lastGuessQuestions = game.questions;
      if (game.guesses >= 3) break;
      continue;
    }
    const question = genie.chooseQuestion(game);
    if (!question) break;
    game.asked.push(question.id);
    game.answers[question.id] = target.traits[question.id] ? 'yes' : 'no';
    game.questions += 1;
  }
  if (won) simulatedWins += 1;
}
assert.equal(simulatedWins, genie.ENTITIES.length, 'The ideal-answer simulation should guess each bundled character within its configured limits.');
console.log(`Genie engine tests passed (${genie.ENTITIES.length} characters, ${genie.QUESTIONS.length} questions; ${simulatedWins}/${genie.ENTITIES.length} ideal-answer simulations guessed correctly).`);
