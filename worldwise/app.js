import { chartAxis } from './chart.js';
import { ROUND_COUNT, formatValue, unitLabel, describeGap, scoreAnswers } from './engine.js';
import { todayUTC, parseRoute, gameRoute } from './routes.js';
import { createDailyHistory, dailyRecord, restoreDaily, createSessionHistory, DAILY_HISTORY_KEY } from './history.js';
import { CURRENT_EDITION, findEdition } from './editions.js';

const app = document.querySelector('#app');
const announcer = document.querySelector('#announcer');
const dialog = document.querySelector('#about-dialog');
const COLORS = ['#0369a1', '#326b5d'];
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const flag = country => String.fromCodePoint(...country.iso2.toUpperCase().split('').map(c => 127397 + c.charCodeAt(0)));
const readStore = key => { try { return localStorage.getItem(key); } catch { return null; } };
const writeStore = (key, value) => { try { localStorage.setItem(key, value); } catch { /* Play works without persistent storage. */ } };
const randomSeed = () => [...crypto.getRandomValues(new Uint8Array(8))].map(n => '0123456789abcdefghijklmnopqrstuvwxyz'[n % 36]).join('');
const dailyHistory = createDailyHistory({getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value)});
let sessions;
let activeEdition = CURRENT_EDITION, navigation = 0;
const editionData = new Map();
let data, geography = {shapes: {}, land: []};
let state = {screen: 'home', daily: false, seed: '', questions: [], answers: [], index: 0};
const sourceDate = () => data.edition || data.generatedAt.slice(0, 10);
const bestKey = () => 'worldwise-best-v4';

document.querySelector('#about').addEventListener('click', () => dialog.showModal());
dialog.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });

async function load() {
  try {
    const initialEdition = findEdition(parseRoute(location.search).version) || CURRENT_EDITION;
    const responses = await Promise.all([fetch(initialEdition.dataPath), fetch('data/geography.json').catch(() => null)]);
    if (!responses[0].ok) throw new Error('Data could not be loaded');
    data = await responses[0].json();
    editionData.set(initialEdition.id, data);
    if (responses[1]?.ok) geography = await responses[1].json();
    app.setAttribute('aria-busy', 'false');
    sessions = createSessionHistory({getItem: key => sessionStorage.getItem(key), setItem: (key, value) => sessionStorage.setItem(key, value)}, `${initialEdition.id}:${sourceDate()}`);
    dailyHistory.all(); // Prune expired results on each visit.
    await openRoute();
  } catch {
    app.setAttribute('aria-busy', 'false');
    app.innerHTML = '<h1>worldwise</h1><p>The atlas didn’t load. Please try again.</p><button id="retry" class="primary">Try again</button>';
    document.querySelector('#retry').addEventListener('click', load);
  }
}

function renderSources() {
  document.querySelector('#data-summary').textContent = `This edition includes ${data.countries.length} countries and ${data.metrics.length} topics. Figures from public sources are saved with the game for quick, reliable play. Charts cover this selection of countries.`;
  const sources = new Map();
  for (const metric of data.metrics) {
    const name = metric.provider || 'World Bank';
    const license = metric.license || metric.sourceLicense || 'CC BY 4.0';
    const licenseUrl = metric.licenseUrl || metric.sourceLicenseUrl || 'https://creativecommons.org/licenses/by/4.0/';
    if (!sources.has(name)) sources.set(name, {url: metric.providerUrl || metric.sourceUrl, license, licenseUrl});
  }
  document.querySelector('#data-sources').innerHTML = 'Data: ' + [...sources].map(([name, s]) => `<a href="${escape(s.url)}" target="_blank" rel="noopener">${escape(name)} ↗</a> (<a href="${escape(s.licenseUrl)}" target="_blank" rel="noopener">${escape(s.license)}</a>)`).join('; ') + '.';
}

function globeMarkup() {
  const rad = Math.PI / 180, centerLon = 15 * rad, centerLat = 15 * rad;
  const dots = geography.land.map(([lon, lat]) => {
    const a = lon * rad - centerLon, b = lat * rad;
    const z = Math.sin(centerLat) * Math.sin(b) + Math.cos(centerLat) * Math.cos(b) * Math.cos(a);
    if (z < .03) return '';
    const x = 150 + 116 * Math.cos(b) * Math.sin(a);
    const y = 150 - 116 * (Math.cos(centerLat) * Math.sin(b) - Math.sin(centerLat) * Math.cos(b) * Math.cos(a));
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(1.1 + z * .3).toFixed(1)}" fill="#6c929f" opacity="${(.45 + z * .55).toFixed(2)}"/>`;
  }).join('');
  return `<svg class="globe" viewBox="0 0 300 300" aria-hidden="true"><circle cx="150" cy="150" r="116" fill="#e8eeeb" stroke="#bbc8c8"/><g fill="none" stroke="#c8d3d2" stroke-width=".65"><ellipse cx="150" cy="150" rx="62" ry="116"/><ellipse cx="150" cy="150" rx="107" ry="116"/><ellipse cx="150" cy="150" rx="116" ry="36"/><ellipse cx="150" cy="150" rx="116" ry="80"/></g>${dots}<g stroke="#9bb1b6" stroke-width=".8"><path d="M150 20v12m0 236v12M20 150h12m236 0h12"/></g><text x="150" y="14" text-anchor="middle" fill="#7c9299" font-size="8" font-family="monospace">N</text></svg>`;
}

function heading(withExit = false) {
  return `<div class="heading"><div><h1>worldwise</h1><p class="lede">two countries. one question. a little perspective.</p></div>${withExit ? '<button class="text-button" data-action="home">home</button>' : ''}</div>`;
}

function rememberGame() {
  if (sessions && ['game', 'results'].includes(state.screen) && !state.archived) sessions.save(state);
}

function navigate(search = '') {
  rememberGame();
  if (location.search !== search || location.hash) history.pushState(null, '', location.pathname + search);
  openRoute();
}

async function openRoute() {
  if (!data) return;
  const request = ++navigation;
  const route = parseRoute(location.search);
  if (location.search !== route.search || location.hash) history.replaceState(null, '', location.pathname + route.search);
  const edition = findEdition(route.version) || CURRENT_EDITION;
  try {
    if (!editionData.has(edition.id)) {
      state.screen = 'loading';
      app.innerHTML = '<h1>worldwise</h1><p class="loading" role="status">Opening the atlas…</p>';
      const response = await fetch(edition.dataPath);
      if (!response.ok) throw new Error('Edition could not be loaded');
      const snapshot = await response.json();
      if (!Array.isArray(snapshot.metrics) || !Array.isArray(snapshot.countries) || !snapshot.edition) throw new Error('Invalid edition');
      editionData.set(edition.id, snapshot);
    }
    if (request !== navigation) return;
    activeEdition = edition;
    data = editionData.get(edition.id);
    renderSources();
  } catch {
    if (request !== navigation) return;
    state.screen = 'error';
    app.innerHTML = `${heading(true)}<p>This game couldn’t be loaded. Please try again.</p><button class="primary" data-action="retry">Try again</button>`;
    wireHome(); app.querySelector('[data-action="retry"]').addEventListener('click', openRoute);
    return;
  }
  if (route.kind === 'home' || route.kind === 'invalid') {
    renderHome(route.message);
    window.scrollTo({top: 0, behavior: 'instant'});
    return;
  }
  startGame(route.seed, route.kind === 'daily');
}

function wireHome() {
  app.querySelector('[data-action="home"]')?.addEventListener('click', () => navigate());
}

function topicIcon(kind) {
  const shapes = {
    compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/>',
    chart: '<path d="M3 3v18h18M7 16v-4m5 4V7m5 9v-6"/>',
    book: '<path d="M12 5v16M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Z"/>',
  };
  return `<svg class="topic-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${shapes[kind]}</svg>`;
}

function renderHome(message = '') {
  state.screen = 'home';
  announcer.textContent = '';
  const best = Number(readStore(bestKey())) || 0;
  const completed = dailyHistory.get(todayUTC());
  const dailyScore = completed ? scoreAnswers(restoreDaily(completed).answers).correct : null;
  app.innerHTML = `${heading()}
    ${message ? `<p class="small" role="status">${escape(message)}</p>` : ''}
    <section class="intro" aria-labelledby="intro-title"><div>
      <span class="eyebrow">a small game about a big world</span>
      <h2 id="intro-title">How well do you<br>know the world?</h2>
      <button class="primary" data-action="play">Let’s find out <span class="arrow" aria-hidden="true">→</span></button>
      <p class="small">10 questions · no timer · a fresh mix every time</p>
    </div><div class="intro-art">${globeMarkup()}<div class="globe-label">${data.countries.length} countries. plenty of surprises.</div></div></section>
    <div class="setup"><div class="daily"><button data-action="daily">The daily ten ↗</button><span class="small">${completed ? `${dailyScore} / 10 · view your results` : 'same game for everyone'}</span></div></div>
    <div class="topics"><div>${topicIcon('compass')}<h3>Trust your instinct.</h3><p>People, nature, and everyday life. Choose one of two countries.</p></div><div>${topicIcon('chart')}<h3>See the bigger picture.</h3><p>Every answer opens a chart. Find your two countries among all the others.</p></div><div>${topicIcon('book')}<h3>Leave a little wiser.</h3><p>Real figures, fair comparisons, and probably a few things you didn’t expect.</p></div></div>
    <p id="home-best" class="small" ${best ? '' : 'hidden'}>Your best: ${best / 100} / 10.</p>`;
  app.querySelector('[data-action="play"]').addEventListener('click', () => navigate(gameRoute(randomSeed(), false, CURRENT_EDITION.id)));
  app.querySelector('[data-action="daily"]').addEventListener('click', () => navigate(gameRoute(`daily-${todayUTC()}`, true)));
}

function startGame(seed, daily) {
  const completed = daily && dailyHistory.get(seed.slice(6));
  if (completed) { state = restoreDaily(completed); renderResults(); return; }
  const edition = `${activeEdition.id}:${sourceDate()}`;
  const checkpoint = sessions.get(seed, daily, edition);
  state = {screen: 'game', seed, daily, version: activeEdition.id, edition, index: checkpoint?.index || 0, answers: []};
  state.questions = activeEdition.generateGame(data, `${sourceDate()}:${seed}`);
  if (checkpoint) {
    state.answers = checkpoint.choices.map((choice, i) => ({choice, correct: choice === state.questions[i].winner}));
    if (checkpoint.screen === 'results' || (daily && state.answers.length === ROUND_COUNT)) { renderResults(); return; }
  }
  rememberGame();
  renderQuestion(true);
}

function silhouette(country) {
  const path = geography.shapes[country.id];
  return path ? `<svg class="shape" viewBox="0 0 240 160" aria-hidden="true"><path d="${path}"/></svg>`
    : '<svg class="shape" viewBox="0 0 240 160" aria-hidden="true"><circle cx="120" cy="80" r="45" fill="none"/><path d="M75 80h90M120 35v90" fill="none"/></svg>';
}

function countryCard(question, country, index, answer) {
  const winner = answer && question.winner === index, picked = answer && answer.choice === index;
  return `<button class="country ${winner ? 'is-winner' : ''} ${picked ? 'is-picked' : ''} ${picked && !winner ? 'is-wrong' : ''}" data-choice="${index}" ${answer ? 'disabled' : ''} aria-label="${escape(country.name)}${answer ? `, ${formatValue(question.metric, question.metric.values[country.id])}${question.metric.unit === 'percent' ? '' : ' ' + unitLabel(question.metric)}, ${winner ? 'correct answer' : 'lower value'}` : ''}">
    <span class="country-top"><span class="country-name">${escape(country.name)}</span><span class="flag" aria-hidden="true">${flag(country)}</span></span>
    ${silhouette(country)}
    <span class="country-bottom">${answer ? `<span class="value">${formatValue(question.metric, question.metric.values[country.id])}<span class="value-unit">${escape(unitLabel(question.metric))}</span></span><span class="answer-label">${winner ? '✓ higher value' : 'lower value'}${picked ? '<br>your pick' : ''}</span>` : `<span class="choose-label">Choose ${escape(country.name)}</span>`}</span></button>`;
}

function renderQuestion(focus = false) {
  const q = state.questions[state.index], m = q.metric, answer = state.answers[state.index];
  if (!answer) announcer.textContent = '';
  const score = scoreAnswers(state.answers);
  app.innerHTML = `${heading(true)}
    <div class="game-meta"><span>${state.daily ? `DAILY · ${state.seed.slice(6)} · UTC` : 'TEN QUESTIONS'}</span><span class="score">${score.points.toLocaleString()} <span class="small">pts</span></span></div>
    <div class="progress" aria-label="Question ${state.index + 1} of ${ROUND_COUNT}">${state.questions.map((_, i) => `<span class="${state.answers[i] ? state.answers[i].correct ? 'right' : 'wrong' : i === state.index ? 'current' : ''}"></span>`).join('')}</div>
    <section class="question"><div class="eyebrow">${String(state.index + 1).padStart(2, '0')} / ${ROUND_COUNT} &nbsp; · &nbsp; ${escape(m.label)}</div><h2 id="question-title" tabindex="-1">${escape(m.question)}</h2><p class="small">${escape(m.timeLabel || `${m.year} data`)}</p><details class="definition"><summary>What counts?</summary><p>${escape(m.definition)}</p></details></section>
    <div class="matchup">${q.countries.map((c, i) => countryCard(q, c, i, answer)).join('')}<span class="versus" aria-hidden="true">or</span></div>
    ${answer ? renderReveal(q, answer) : ''}`;
  wireHome();
  app.querySelectorAll('[data-choice]').forEach(button => button.addEventListener('click', () => choose(Number(button.dataset.choice))));
  if (answer) {
    app.querySelector('[data-action="next"]').addEventListener('click', nextQuestion);
    wireChart(app);
  }
  if (focus) {
    document.querySelector('#question-title').focus({preventScroll: true});
    window.scrollTo({top: 0, behavior: 'instant'});
  }
}

function choose(choice) {
  if (state.screen !== 'game' || state.answers[state.index] || ![0, 1].includes(choice)) return;
  const completed = state.daily && dailyHistory.get(state.seed.slice(6));
  if (completed) { state = restoreDaily(completed); renderResults(); return; }
  const question = state.questions[state.index];
  const correct = choice === question.winner;
  state.answers.push({choice, correct});
  if (state.daily && state.answers.length === ROUND_COUNT) state.dailySaved = dailyHistory.save(dailyRecord(state)).saved;
  rememberGame();
  renderQuestion();
  announcer.textContent = `${correct ? 'Correct. One hundred points.' : 'Not quite.'} ${question.countries[question.winner].name} has the higher value. ${describeGap(question)}`;
  app.querySelector('[data-action="next"]').focus({preventScroll: true});
  // Keep both revealed values visible while bringing the next action into view on phones.
  app.querySelector('.reveal-top').scrollIntoView({block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
}

function nextQuestion() {
  if (!state.answers[state.index]) return;
  if (state.index === ROUND_COUNT - 1) renderResults();
  else { state.index++; rememberGame(); renderQuestion(true); }
}

function renderReveal(q, answer) {
  return `<section class="reveal" aria-label="Answer and comparison"><div class="reveal-top"><div><h3 class="verdict ${answer.correct ? 'correct' : ''}">${answer.correct ? 'Nicely done. +100' : 'A little surprise.'}</h3><p>${escape(describeGap(q))}</p></div><button class="primary" data-action="next">${state.index === ROUND_COUNT - 1 ? 'See results' : 'Next question'} →</button></div>${distribution(q)}<div class="source-line"><a href="${q.metric.sourceUrl}" target="_blank" rel="noopener">${escape(q.metric.provider || 'World Bank')} · ${q.metric.year} ↗</a>${q.metric.denominatorSourceUrl ? `<a href="${q.metric.denominatorSourceUrl}" target="_blank" rel="noopener">Population denominator ↗</a>` : ''}</div></section>`;
}

function chartEntries(metric) {
  return data.countries.filter(c => Number.isFinite(metric.values[c.id])).map(c => ({...c, value: metric.values[c.id]})).sort((a, b) => a.value - b.value);
}

function distribution(q) {
  const m = q.metric, entries = chartEntries(m);
  const {min, max, transform, ticks, label: axisLabel, note: axisNote} = chartAxis(m, entries.map(c => c.value));
  const width = 700, left = 28, right = 672, axisY = 135;
  const position = value => left + (transform(value) - min) / (max - min) * (right - left);
  const placed = [];
  const circles = entries.map(country => {
    const x = position(country.value), selected = q.countries.findIndex(c => c.id === country.id), radius = selected >= 0 ? 6 : 3.8;
    let y = 115;
    // Pack dots vertically rather than hiding dense clusters on a single line.
    while (placed.some(p => Math.hypot(p.x - x, p.y - y) < p.radius + radius + 1.2)) y -= 9;
    placed.push({x, y, radius});
    return {country, x, y, radius, selected};
  });
  const lowestY = Math.min(...circles.map(c => c.y)), offset = Math.max(0, 17 - lowestY), height = 175 + offset;
  const dots = circles.sort((a, b) => a.selected - b.selected).map(({country, x, y, radius, selected}) => `<circle id="dot-${m.id}-${country.id}" data-value="${country.value}" class="dot ${selected === 0 ? 'a' : selected === 1 ? 'b' : ''}" cx="${x.toFixed(1)}" cy="${(y + offset).toFixed(1)}" r="${radius}" data-tip="${escape(`${country.name}: ${formatValue(m, country.value, true)}${m.unit === 'percent' ? '' : ' ' + unitLabel(m)}`)}"><title>${escape(country.name)}: ${formatValue(m, country.value, true)}</title></circle>`).join('');
  return `<div class="chart-panel"><div class="chart-top"><h3>Where they stand.</h3><span>${entries.length} countries · ${escape(m.timeLabel || m.year)}${axisLabel ? ' · ' + escape(axisLabel) : ''}</span></div>
    <svg class="distribution" viewBox="0 0 ${width} ${height}" tabindex="0" role="group" aria-roledescription="interactive chart" aria-label="Distribution of ${escape(m.label)} for ${entries.length} countries. ${q.countries.map(c => `${escape(c.name)}: ${formatValue(m, m.values[c.id])}`).join('. ')}. Use the left and right arrow keys to explore country values.">
    ${ticks.map(t => { const x = left + (t.t - min) / (max - min) * (right - left); return `<path class="tick" d="M${x} ${10 + offset}V${axisY + offset}"/><text x="${x}" y="${axisY + offset + 20}" text-anchor="${x === left ? 'start' : x === right ? 'end' : 'middle'}">${formatValue(m, t.value)}</text>`; }).join('')}${dots}</svg>
    <div class="chart-legend">${q.countries.map((c, i) => `<span><i style="background:${COLORS[i]}"></i>${escape(c.name)} · ${formatValue(m, m.values[c.id])}</span>`).join('')}</div><p class="chart-tip">Hover or tap a dot to meet another country.</p><p class="chart-note">Each dot is one country in this game’s dataset.${axisNote ? ' ' + escape(axisNote) : ''}</p></div>`;
}

function wireChart(root) {
  root.querySelectorAll('.distribution').forEach(svg => {
    const dots = [...svg.querySelectorAll('.dot')].sort((a, b) => Number(a.dataset.value) - Number(b.dataset.value));
    const tip = svg.closest('.chart-panel').querySelector('.chart-tip');
    let activeIndex = dots.findIndex(dot => dot.classList.contains('a'));
    function show(dot, announce = false) {
      dots.forEach(d => d.classList.toggle('is-active', d === dot));
      activeIndex = dots.indexOf(dot);
      tip.textContent = dot.dataset.tip;
      if (announce) announcer.textContent = dot.dataset.tip;
    }
    dots.forEach(dot => dot.addEventListener('pointerenter', () => show(dot)));
    svg.addEventListener('focus', () => show(dots[activeIndex], true));
    svg.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? dots.length - 1
        : Math.max(0, Math.min(dots.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
      show(dots[index], true);
    });
    svg.addEventListener('click', event => {
      const candidates = dots.map(dot => {
        const box = dot.getBoundingClientRect();
        return {dot, distance: Math.hypot(event.clientX - box.x - box.width / 2, event.clientY - box.y - box.height / 2)};
      }).sort((a, b) => a.distance - b.distance);
      if (candidates[0]?.distance < 20) show(candidates[0].dot);
    });
  });
}

function reviewItem(q, answer, index) {
  const values = q.countries.map(c => q.metric.values[c.id]);
  const low = Math.min(0, ...values), high = Math.max(0, ...values), span = high - low || 1;
  return `<details class="review-item"><summary><span class="review-status ${answer.correct ? '' : 'wrong'}" aria-label="${answer.correct ? 'Correct' : 'Incorrect'}">${answer.correct ? '✓' : '×'}</span><span>${q.countries.map(c => escape(c.name)).join(' & ')}<span class="review-topic">${index + 1}. ${escape(q.metric.label)} · ${q.metric.year}</span></span><span class="review-chevron" aria-hidden="true">+</span></summary><div class="review-body"><p>${escape(q.metric.question)}<br>You picked ${escape(q.countries[answer.choice].name)}.</p>${q.countries.map((c, i) => `<div class="mini-bar ${i === q.winner ? 'winner' : ''}"><span>${escape(c.name)}</span><div class="mini-bar-track ${low < 0 ? 'signed' : ''}" style="--zero:${-low / span * 100}%"><i style="margin-left:${(Math.min(0, values[i]) - low) / span * 100}%;width:${Math.abs(values[i]) / span * 100}%"></i></div><strong>${formatValue(q.metric, q.metric.values[c.id])}</strong></div>`).join('')}<p>${escape(describeGap(q))} <a href="${escape(q.metric.sourceUrl)}" target="_blank" rel="noopener">Source ↗</a></p><p>${escape(q.metric.definition)}</p></div></details>`;
}

function renderResults() {
  state.screen = 'results';
  if (state.daily && !state.archived && state.dailySaved === undefined) state.dailySaved = dailyHistory.save(dailyRecord(state)).saved;
  rememberGame();
  const score = scoreAnswers(state.answers);
  const priorBest = Number(readStore(bestKey())) || 0, best = Math.max(priorBest, score.points);
  writeStore(bestKey(), String(best));
  const titles = ['A bigger world than you thought.', 'A few new bearings.', 'Your instincts travel well.', 'You know your way around.', 'Quite the world view.'];
  const title = titles[score.correct === 10 ? 4 : score.correct >= 8 ? 3 : score.correct >= 6 ? 2 : score.correct >= 4 ? 1 : 0];
  const messages = score.correct === 10 ? 'Ten for ten. The atlas owes you an apology for doubting you.' : score.correct >= 7 ? 'A good eye for the world. Revisit the surprises below, or see where another ten take you.' : 'The world is good at surprising us. You’re leaving with a few more pieces of it than you came with.';
  app.innerHTML = `${heading(true)}<section class="results-hero"><div class="eyebrow">${state.daily ? `the daily ten · ${state.seed.slice(6)}` : 'ten questions. a little more perspective.'}</div><div class="results-number">${score.correct}<span> / 10</span></div><div class="results-dots" aria-hidden="true">${state.answers.map(a => `<span class="${a.correct ? 'right' : ''}"></span>`).join('')}</div><h2 id="results-title" tabindex="-1">${title}</h2><p>${messages}</p><div class="result-actions"><button class="primary" data-action="again">Another ten →</button><button data-action="share">Copy challenge</button></div>${state.dailySaved === false ? '<p class="small" role="status">This browser couldn’t save your daily result.</p>' : ''}<p id="copy-status" class="small" role="status" hidden></p><textarea id="copy-fallback" class="copy-fallback" aria-label="Challenge text to copy" readonly hidden></textarea></section>
    <div class="result-metrics"><div><strong>${score.points}</strong><span>points</span></div><div><strong>${score.bestStreak}</strong><span>best streak</span></div><div><strong>${best / 100} / 10</strong><span>personal best</span></div></div>
    <h2 class="review-title">A look back.</h2><p class="small">Open a matchup to revisit the figures.</p>${state.questions.map((q, i) => reviewItem(q, state.answers[i], i)).join('')}`;
  wireHome();
  app.querySelector('[data-action="again"]').addEventListener('click', () => navigate(gameRoute(randomSeed(), false, CURRENT_EDITION.id)));
  app.querySelector('[data-action="share"]').addEventListener('click', copyChallenge);
  document.querySelector('#results-title').focus({preventScroll: true});
  window.scrollTo({top: 0, behavior: 'instant'});
  announcer.textContent = `Round complete. ${score.correct} out of ten correct. ${score.points} points.`;
}

async function copyChallenge() {
  const score = scoreAnswers(state.answers);
  const url = new URL(location.href);
  url.search = gameRoute(state.seed, state.daily, state.version || activeEdition.id);
  url.hash = '';
  const text = `worldwise · ${score.correct}/10\n${state.answers.map(a => a.correct ? '🟦' : '⬜').join('')}\n${state.daily ? 'The daily ten. Your turn.' : 'Same ten. Your turn.'}\n${url.href}`;
  const status = document.querySelector('#copy-status');
  status.hidden = false;
  try {
    await navigator.clipboard.writeText(text);
    status.innerHTML = `Copied. <a href="${escape(url.href)}">Open this challenge →</a>`;
  } catch {
    const field = document.querySelector('#copy-fallback');
    field.hidden = false; field.value = text; field.focus(); field.select();
    status.textContent = 'Select and copy your challenge below.';
  }
}

document.addEventListener('keydown', event => {
  if (dialog.open || state.screen !== 'game' || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
  if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;
  if (!state.answers[state.index] && (event.key === '1' || event.key === '2')) { event.preventDefault(); choose(Number(event.key) - 1); }
  // Enter naturally activates the focused Next button after each reveal.
});

window.addEventListener('popstate', () => { rememberGame(); openRoute(); });
window.addEventListener('pagehide', rememberGame);
window.addEventListener('storage', event => {
  if (!data || (event.key !== DAILY_HISTORY_KEY && event.key !== null)) return;
  if (state.screen === 'home') renderHome();
  else if (state.daily) {
    const completed = dailyHistory.get(state.seed.slice(6));
    if (completed) { state = restoreDaily(completed); renderResults(); }
  }
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && data && state.screen === 'home') renderHome();
});

load();
