/**
 * MTG Rapid Collector-Number Lister & TCGplayer Level 4 CSV Tool
 * - Caches entire sets from Scryfall for 0ms instant collector number lookup
 * - Supports offline demo/fallback cards for instant testing
 * - Matches exported TCGplayer Level 4 Pricing CSVs by SKU (Set + Number + Name + Condition + Foil)
 */

const STORAGE_KEY = 'mtg_rapid_lister_inventory_v1';

// Built-in offline fallback cache for common test cards so the app works even offline
const BUILTIN_FALLBACK_CARDS = {
  MH3: {
    '142': {
      name: 'Nadu, Winged Wisdom',
      set: 'mh3',
      set_name: 'Modern Horizons 3',
      collector_number: '142',
      rarity: 'rare',
      frame_effects: [],
      border_color: 'black',
      finishes: ['nonfoil', 'foil'],
      prices: { usd: '1.25', usd_foil: '2.50', usd_etched: null },
      tcgplayer_id: 552811,
      image: 'https://cards.scryfall.io/normal/front/b/4/b4c677f9-676d-4084-8671-b27e972b7500.jpg'
    },
    '214': {
      name: 'Phlage, Titan of Fire\'s Fury',
      set: 'mh3',
      set_name: 'Modern Horizons 3',
      collector_number: '214',
      rarity: 'mythic',
      frame_effects: [],
      border_color: 'black',
      finishes: ['nonfoil', 'foil'],
      prices: { usd: '26.50', usd_foil: '32.00', usd_etched: null },
      tcgplayer_id: 552301,
      image: 'https://cards.scryfall.io/normal/front/e/4/e419cd0b-2449-4cc5-9ead-b9e45e271700.jpg'
    },
    '234': {
      name: 'Wooded Foothills',
      set: 'mh3',
      set_name: 'Modern Horizons 3',
      collector_number: '234',
      rarity: 'rare',
      frame_effects: [],
      border_color: 'black',
      finishes: ['nonfoil', 'foil'],
      prices: { usd: '12.40', usd_foil: '15.80', usd_etched: null },
      tcgplayer_id: 541205,
      image: 'https://cards.scryfall.io/normal/front/a/8/a86a8046-1163-41db-a043-90b5a27f5080.jpg'
    },
    '325': {
      name: 'Phlage, Titan of Fire\'s Fury (Borderless)',
      set: 'mh3',
      set_name: 'Modern Horizons 3',
      collector_number: '325',
      rarity: 'mythic',
      frame_effects: ['inverted'],
      border_color: 'borderless',
      finishes: ['nonfoil', 'foil'],
      prices: { usd: '38.00', usd_foil: '49.99', usd_etched: null },
      tcgplayer_id: 552399,
      image: 'https://cards.scryfall.io/normal/front/e/4/e419cd0b-2449-4cc5-9ead-b9e45e271700.jpg'
    },
    '412': {
      name: 'Wooded Foothills (Retro Frame)',
      set: 'mh3',
      set_name: 'Modern Horizons 3',
      collector_number: '412',
      rarity: 'rare',
      frame_effects: ['retro'],
      border_color: 'black',
      finishes: ['nonfoil', 'foil', 'etched'],
      prices: { usd: '19.50', usd_foil: '34.00', usd_etched: '24.00' },
      tcgplayer_id: 541310,
      image: 'https://cards.scryfall.io/normal/front/a/8/a86a8046-1163-41db-a043-90b5a27f5080.jpg'
    },
    '15': {
      name: 'Mandibular Kite',
      set: 'mh3',
      set_name: 'Modern Horizons 3',
      collector_number: '15',
      rarity: 'common',
      frame_effects: [],
      border_color: 'black',
      finishes: ['nonfoil', 'foil'],
      prices: { usd: '0.12', usd_foil: '0.35', usd_etched: null },
      tcgplayer_id: 552901,
      image: ''
    }
  }
};

// State
const setCache = {}; // { 'MH3': { '142': cardObj, ... } }
let inventory = [];  // Array of scanned line items
let tcgPricingMap = new Map(); // Key: normalized lookup -> TCGplayer CSV row
let tcgPricingHeaders = null;
let sessionStartTime = Date.now();
let totalCardsEnteredSession = 0;

// DOM Elements
const form = document.getElementById('rapid-entry-form');
const setCodeInput = document.getElementById('set-code-input');
const loadSetBtn = document.getElementById('load-set-btn');
const setStatusHint = document.getElementById('set-status-hint');
const collectorInput = document.getElementById('collector-num-input');
const batchBoxInput = document.getElementById('batch-box-input');
const audioToggle = document.getElementById('audio-toggle');

const previewImg = document.getElementById('preview-card-img');
const previewName = document.getElementById('preview-card-name');
const previewSet = document.getElementById('preview-card-set');
const previewPrice = document.getElementById('preview-card-price');
const previewTcgId = document.getElementById('preview-tcg-id');
const variantBadge = document.getElementById('variant-alert-badge');
const warningBanner = document.getElementById('preview-warning-banner');

const tcgCsvFileInput = document.getElementById('tcg-csv-file');
const tcgCsvStatus = document.getElementById('tcg-csv-status');
const priceSourceSelect = document.getElementById('price-source-select');
const priceFloorInput = document.getElementById('price-floor-input');
const bulkSkipInput = document.getElementById('bulk-skip-input');
const excludeBulkCheckbox = document.getElementById('exclude-bulk-checkbox');

const tbody = document.getElementById('inventory-tbody');
const tableCountBadge = document.getElementById('table-count-badge');
const statTotalQty = document.getElementById('stat-total-qty');
const statUniqueRows = document.getElementById('stat-unique-rows');
const statTotalValue = document.getElementById('stat-total-value');
const statPace = document.getElementById('stat-pace');

// Audio synthesizer (Web Audio API - zero external files needed)
let audioCtx = null;
function playFeedbackBeep(type = 'ok') {
  if (!audioToggle.checked) return;
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'high_value') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.setValueAtTime(990, now + 0.08);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === 'warning' || type === 'error') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(210, now);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      osc.start(now);
      osc.stop(now + 0.11);
    }
  } catch (_) {
    // Ignore audio errors if blocked by browser autoplay policy
  }
}

// Helpers
function normalizeCollectorNum(raw) {
  const trimmed = String(raw || '').trim();
  // Remove leading zeros on numeric collector numbers ("0142" -> "142", "0142a" -> "142a")
  return trimmed.replace(/^0+(?=\d)/, '');
}

function getSelectedRadio(name) {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : '';
}

function detectVariantLabel(card) {
  const tags = [];
  if (card.border_color === 'borderless') tags.push('Borderless');
  const effects = card.frame_effects || [];
  if (effects.includes('showcase')) tags.push('Showcase');
  if (effects.includes('extendedart')) tags.push('Extended Art');
  if (effects.includes('retro') || card.frame === '1997') tags.push('Retro Frame');
  if (effects.includes('etched')) tags.push('Etched');
  if (card.promo_types && card.promo_types.includes('surgefoil')) tags.push('Surge Foil');
  if (card.promo_types && card.promo_types.includes('textured')) tags.push('Textured');
  if (card.set && ['plst', 'mb1', 'mb2'].includes(card.set.toLowerCase())) {
    tags.push('⚠️ THE LIST / MYSTERY BOOSTER');
  }
  return tags.length > 0 ? tags.join(' • ') : 'Standard';
}

function getScryfallMarketPrice(card, finish) {
  if (!card || !card.prices) return 0;
  let raw = null;
  if (finish === 'Etched') {
    raw = card.prices.usd_etched || card.prices.usd_foil || card.prices.usd;
  } else if (finish === 'Foil') {
    raw = card.prices.usd_foil || card.prices.usd;
  } else {
    raw = card.prices.usd || card.prices.usd_foil;
  }
  const num = parseFloat(raw);
  return Number.isFinite(num) ? num : 0;
}

function calculateTargetL4Price(entry) {
  const floor = Math.max(0.01, parseFloat(priceFloorInput.value) || 0.49);
  const formula = priceSourceSelect.value;

  // Check if we have a matched TCGplayer CSV row with live TCGplayer prices
  const tcgRow = findMatchingTcgCsvRow(entry);
  let base = entry.marketPrice || 0;

  if (tcgRow) {
    const tcgMarket = parseFloat(tcgRow['TCG Market Price']) || base;
    const tcgLow = parseFloat(tcgRow['TCG Low Price']) || tcgMarket;
    const tcgDirectLow = parseFloat(tcgRow['TCG Direct Low']) || tcgMarket;

    if (formula === 'low') base = tcgLow;
    else if (formula === 'direct_low') base = tcgDirectLow;
    else if (formula === 'market_plus_5pct') base = tcgMarket * 1.05;
    else if (formula === 'market_minus_5pct') base = tcgMarket * 0.95;
    else base = tcgMarket;
  } else {
    if (formula === 'market_plus_5pct') base = base * 1.05;
    else if (formula === 'market_minus_5pct') base = base * 0.95;
  }

  return Math.max(floor, Number(base.toFixed(2)));
}

// Scryfall Full-Set Caching
async function loadAndCacheSet(setCodeRaw) {
  const setCode = (setCodeRaw || '').trim().toUpperCase();
  if (!setCode) return;

  if (setCache[setCode] && Object.keys(setCache[setCode]).length > 10) {
    setStatusHint.textContent = `✓ Set ${setCode} cached in memory (${Object.keys(setCache[setCode]).length} printings ready for 0ms lookup).`;
    return;
  }

  // Seed with built-in fallback immediately so offline testing works seamlessly
  if (!setCache[setCode]) {
    setCache[setCode] = { ...(BUILTIN_FALLBACK_CARDS[setCode] || {}) };
  }

  setStatusHint.textContent = `Fetching all printings for ${setCode} from Scryfall...`;
  loadSetBtn.disabled = true;

  try {
    let url = `https://api.scryfall.com/cards/search?q=e%3A${encodeURIComponent(setCode.toLowerCase())}&unique=prints&order=set`;
    let count = 0;

    while (url) {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Scryfall HTTP ${resp.status}`);
      const data = await resp.json();
      for (const c of data.data || []) {
        const normNum = normalizeCollectorNum(c.collector_number);
        const imgUrl = c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal || '';
        setCache[setCode][normNum] = {
          name: c.name,
          set: c.set,
          set_name: c.set_name,
          collector_number: normNum,
          rarity: c.rarity,
          frame_effects: c.frame_effects || [],
          border_color: c.border_color,
          promo_types: c.promo_types || [],
          finishes: c.finishes || [],
          prices: c.prices || {},
          tcgplayer_id: c.tcgplayer_id || c.tcgplayer_etched_id || '',
          tcgplayer_etched_id: c.tcgplayer_etched_id || '',
          image: imgUrl
        };
        count++;
      }
      url = data.has_more ? data.next_page : null;
    }

    setStatusHint.textContent = `✓ Cached ${count} cards from ${setCode}. Every Collector # now resolves in 0ms!`;
  } catch (err) {
    const fallbackCount = Object.keys(setCache[setCode] || {}).length;
    setStatusHint.textContent = fallbackCount > 0
      ? `Offline / Scryfall unreachable — using ${fallbackCount} built-in demo cards for ${setCode} (or single-card lookup).`
      : `Could not pre-cache set ${setCode} (${err.message}). Will look up individual collector numbers on demand.`;
  } finally {
    loadSetBtn.disabled = false;
  }
}

async function resolveCard(setCodeRaw, collectorNumRaw) {
  const setCode = setCodeRaw.trim().toUpperCase();
  const collNum = normalizeCollectorNum(collectorNumRaw);

  if (setCache[setCode] && setCache[setCode][collNum]) {
    return setCache[setCode][collNum];
  }
  if (BUILTIN_FALLBACK_CARDS[setCode] && BUILTIN_FALLBACK_CARDS[setCode][collNum]) {
    return BUILTIN_FALLBACK_CARDS[setCode][collNum];
  }

  // Try direct Scryfall single-card endpoint
  try {
    const resp = await fetch(`https://api.scryfall.com/cards/${encodeURIComponent(setCode.toLowerCase())}/${encodeURIComponent(collNum)}`);
    if (resp.ok) {
      const c = await resp.json();
      const cardObj = {
        name: c.name,
        set: c.set,
        set_name: c.set_name,
        collector_number: normalizeCollectorNum(c.collector_number),
        rarity: c.rarity,
        frame_effects: c.frame_effects || [],
        border_color: c.border_color,
        promo_types: c.promo_types || [],
        finishes: c.finishes || [],
        prices: c.prices || {},
        tcgplayer_id: c.tcgplayer_id || c.tcgplayer_etched_id || '',
        tcgplayer_etched_id: c.tcgplayer_etched_id || '',
        image: c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal || ''
      };
      if (!setCache[setCode]) setCache[setCode] = {};
      setCache[setCode][collNum] = cardObj;
      return cardObj;
    }
  } catch (_) {
    // Offline fallback
  }

  return null;
}

// Add or Increment Card Entry
async function handleCardSubmission(rawInput) {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) return;

  // Shortcut: "+" increments quantity of the last entered row
  if (trimmed === '+' && inventory.length > 0) {
    inventory[0].qty += 1;
    totalCardsEnteredSession += 1;
    playFeedbackBeep('ok');
    saveAndRender();
    updatePreviewPanel(inventory[0]);
    collectorInput.value = '';
    return;
  }

  // Parse "142*4" or "142 x 4" syntax for multi-quantity entry
  let collPart = trimmed;
  let qty = 1;
  const multMatch = trimmed.match(/^([0-9a-zA-Z★☆-]+)\s*[*xX]\s*(\d+)$/);
  if (multMatch) {
    collPart = multMatch[1];
    qty = Math.max(1, parseInt(multMatch[2], 10) || 1);
  }

  const setCode = setCodeInput.value.trim().toUpperCase() || 'MH3';
  const finish = getSelectedRadio('batchFinish') || 'Normal';
  const condition = getSelectedRadio('batchCondition') || 'Near Mint';
  const boxLocation = batchBoxInput.value.trim() || 'Box 1';
  const normColl = normalizeCollectorNum(collPart);

  const card = await resolveCard(setCode, normColl);

  const variantLabel = card ? detectVariantLabel(card) : 'Unverified Collector #';
  const marketPrice = card ? getScryfallMarketPrice(card, finish) : 0;
  const tcgProductId = card
    ? (finish === 'Etched' && card.tcgplayer_etched_id ? card.tcgplayer_etched_id : card.tcgplayer_id)
    : '';

  // Consolidate if the exact same Set + Collector# + Finish + Condition + Box was just entered or exists
  const existingIdx = inventory.findIndex(
    item =>
      item.setCode === setCode &&
      item.collectorNumber === normColl &&
      item.finish === finish &&
      item.condition === condition &&
      item.boxLocation === boxLocation
  );

  let activeEntry;
  if (existingIdx !== -1) {
    inventory[existingIdx].qty += qty;
    activeEntry = inventory[existingIdx];
    // Move to top of log so the user sees it as the latest action
    inventory.splice(existingIdx, 1);
    inventory.unshift(activeEntry);
  } else {
    activeEntry = {
      id: Date.now() + Math.random().toString(36).slice(2, 6),
      setCode,
      setName: card ? card.set_name : setCode,
      collectorNumber: normColl,
      qty,
      cardName: card ? card.name : `Unknown (${setCode} #${normColl})`,
      variant: variantLabel,
      finish,
      condition,
      marketPrice,
      tcgProductId: String(tcgProductId || ''),
      boxLocation,
      image: card ? card.image : '',
      verified: Boolean(card)
    };
    inventory.unshift(activeEntry);
  }

  totalCardsEnteredSession += qty;

  // Audio feedback
  const bulkThreshold = parseFloat(bulkSkipInput.value) || 0.25;
  if (!card) {
    playFeedbackBeep('error');
  } else if (marketPrice >= 5.0) {
    playFeedbackBeep('high_value');
  } else if (marketPrice > 0 && marketPrice < bulkThreshold) {
    playFeedbackBeep('warning');
  } else {
    playFeedbackBeep('ok');
  }

  collectorInput.value = '';
  updatePreviewPanel(activeEntry);
  saveAndRender();
}

function updatePreviewPanel(entry) {
  if (!entry) return;
  previewName.textContent = `${entry.cardName} (Qty: ${entry.qty})`;
  previewSet.textContent = `${entry.setName} (${entry.setCode}) • #${entry.collectorNumber} • ${entry.condition} • ${entry.finish}`;
  previewPrice.textContent = entry.marketPrice > 0 ? `$${entry.marketPrice.toFixed(2)}` : 'N/A';

  const matchedRow = findMatchingTcgCsvRow(entry);
  const resolvedSku = matchedRow ? matchedRow['TCGplayer Id'] : entry.tcgProductId;
  previewTcgId.textContent = resolvedSku || 'Pending CSV Match';

  if (entry.image) {
    previewImg.src = entry.image;
  }

  // Variant badge highlight
  variantBadge.classList.remove('hidden', 'standard', 'special');
  if (entry.variant && entry.variant !== 'Standard') {
    variantBadge.textContent = `⚠️ ${entry.variant}`;
    variantBadge.classList.add('special');
  } else {
    variantBadge.textContent = 'STANDARD FRAME';
    variantBadge.classList.add('standard');
  }

  // Warnings for unverified or bulk
  const bulkThreshold = parseFloat(bulkSkipInput.value) || 0.25;
  const warnings = [];
  if (!entry.verified) {
    warnings.push(`Collector #${entry.collectorNumber} not found in cached set ${entry.setCode}. Double-check number!`);
  }
  if (entry.marketPrice > 0 && entry.marketPrice < bulkThreshold) {
    warnings.push(`Bulk Alert: Market price ($${entry.marketPrice.toFixed(2)}) is below your $${bulkThreshold.toFixed(2)} threshold.`);
  }
  if (warnings.length > 0) {
    warningBanner.textContent = warnings.join(' ');
    warningBanner.classList.remove('hidden');
  } else {
    warningBanner.classList.add('hidden');
  }
}

// TCGplayer Level 4 CSV Parsing & Matching
function parseCsvText(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(cur);
        cur = '';
      } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        if (ch === '\r') i++;
        row.push(cur);
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  if (cur !== '' || row.length > 0) {
    row.push(cur);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}

function buildConditionKey(cond, finish) {
  const c = (cond || 'Near Mint').trim().toLowerCase();
  const f = (finish || 'Normal').trim().toLowerCase();
  const isFoil = f === 'foil' || f === 'etched';
  return `${c}|${isFoil ? 'foil' : 'normal'}`;
}

function parseConditionFromTcgCsv(rawCondition) {
  const lower = (rawCondition || '').trim().toLowerCase();
  const isFoil = lower.includes('foil');
  const baseCond = lower.replace(/\s*foil\s*$/i, '').trim() || 'near mint';
  return `${baseCond}|${isFoil ? 'foil' : 'normal'}`;
}

function findMatchingTcgCsvRow(entry) {
  if (tcgPricingMap.size === 0) return null;
  const condKey = buildConditionKey(entry.condition, entry.finish);
  const normNum = normalizeCollectorNum(entry.collectorNumber).toLowerCase();
  const setNameLower = (entry.setName || '').toLowerCase();
  const baseCardName = (entry.cardName || '').replace(/\s*\(.*?\)\s*$/, '').toLowerCase();

  // 1. Exact Set Name + Collector Number + Condition|Foil
  const key1 = `setnum|${setNameLower}|${normNum}|${condKey}`;
  if (tcgPricingMap.has(key1)) return tcgPricingMap.get(key1);

  // 2. Collector Number + Base Card Name + Condition|Foil
  const key2 = `name|${baseCardName}|${normNum}|${condKey}`;
  if (tcgPricingMap.has(key2)) return tcgPricingMap.get(key2);

  // 3. Collector Number + Condition|Foil fallback (when single-set CSV is loaded)
  const key3 = `numonly|${normNum}|${condKey}`;
  if (tcgPricingMap.has(key3)) return tcgPricingMap.get(key3);

  return null;
}

tcgCsvFileInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const parsed = parseCsvText(text);
  if (parsed.length < 2) {
    tcgCsvStatus.textContent = '⚠️ CSV file appears empty or invalid.';
    return;
  }

  tcgPricingHeaders = parsed[0].map(h => h.trim());
  tcgPricingMap.clear();

  let indexedCount = 0;
  for (let i = 1; i < parsed.length; i++) {
    const vals = parsed[i];
    const rowObj = {};
    tcgPricingHeaders.forEach((h, idx) => {
      rowObj[h] = vals[idx] !== undefined ? vals[idx].trim() : '';
    });

    const setName = (rowObj['Set Name'] || '').toLowerCase();
    const num = normalizeCollectorNum(rowObj['Number'] || '').toLowerCase();
    const prodName = (rowObj['Product Name'] || '').replace(/\s*\(.*?\)\s*$/, '').toLowerCase();
    const condKey = parseConditionFromTcgCsv(rowObj['Condition']);

    if (num) {
      tcgPricingMap.set(`setnum|${setName}|${num}|${condKey}`, rowObj);
      tcgPricingMap.set(`name|${prodName}|${num}|${condKey}`, rowObj);
      if (!tcgPricingMap.has(`numonly|${num}|${condKey}`)) {
        tcgPricingMap.set(`numonly|${num}|${condKey}`, rowObj);
      }
      indexedCount++;
    }
  }

  tcgCsvStatus.textContent = `✓ Loaded ${indexedCount} TCGplayer SKUs from "${file.name}". Exact SKU & live price matching active!`;
  saveAndRender();
});

// Render Table & Stats
function saveAndRender() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inventory));
  } catch (_) {}

  const bulkThreshold = parseFloat(bulkSkipInput.value) || 0.25;
  let totalQty = 0;
  let totalEstVal = 0;

  if (inventory.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="13">No cards entered yet. Pick a Set Code on the left, type a Collector Number (e.g. <code>142</code>), and press <kbd>Enter</kbd>.</td></tr>`;
  } else {
    tbody.innerHTML = inventory.map((entry, idx) => {
      const targetPrice = calculateTargetL4Price(entry);
      const matchedTcg = findMatchingTcgCsvRow(entry);
      const displaySku = matchedTcg ? matchedTcg['TCGplayer Id'] : (entry.tcgProductId || '—');
      const isBulk = entry.marketPrice > 0 && entry.marketPrice < bulkThreshold;
      const isHighVal = entry.marketPrice >= 5.0;

      totalQty += entry.qty;
      totalEstVal += entry.qty * (entry.marketPrice || targetPrice);

      const finishBadge = entry.finish === 'Foil'
        ? `<span class="tag-foil">✨ Foil</span>`
        : entry.finish === 'Etched'
          ? `<span class="tag-etched">💎 Etched</span>`
          : 'Normal';

      const variantCell = entry.variant !== 'Standard'
        ? `<span class="tag-variant">${escapeHtml(entry.variant)}</span>`
        : 'Standard';

      return `
        <tr class="${isBulk ? 'bulk-warning-row' : ''} ${isHighVal ? 'high-value-row' : ''}">
          <td>${inventory.length - idx}</td>
          <td><strong>${escapeHtml(entry.setCode)}</strong></td>
          <td><code>#${escapeHtml(entry.collectorNumber)}</code></td>
          <td><strong>${entry.qty}</strong></td>
          <td>${escapeHtml(entry.cardName)}</td>
          <td>${variantCell}</td>
          <td>${finishBadge}</td>
          <td>${escapeHtml(entry.condition)}</td>
          <td>$${(entry.marketPrice || 0).toFixed(2)}</td>
          <td><strong>$${targetPrice.toFixed(2)}</strong></td>
          <td><code>${escapeHtml(displaySku)}</code></td>
          <td>${escapeHtml(entry.boxLocation)}</td>
          <td>
            <button type="button" class="btn btn-small" onclick="adjustRowQty('${entry.id}', 1)">+1</button>
            <button type="button" class="btn btn-small btn-danger" onclick="removeRow('${entry.id}')">✕</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  tableCountBadge.textContent = String(inventory.length);
  statTotalQty.textContent = String(totalQty);
  statUniqueRows.textContent = String(inventory.length);
  statTotalValue.textContent = `$${totalEstVal.toFixed(2)}`;

  const elapsedHours = Math.max(0.01, (Date.now() - sessionStartTime) / 3600000);
  const pace = totalCardsEnteredSession > 0 ? Math.round(totalCardsEnteredSession / elapsedHours) : 0;
  statPace.textContent = `${pace} / hr`;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

window.adjustRowQty = function (id, delta) {
  const idx = inventory.findIndex(r => r.id === id);
  if (idx === -1) return;
  inventory[idx].qty = Math.max(1, inventory[idx].qty + delta);
  saveAndRender();
};

window.removeRow = function (id) {
  inventory = inventory.filter(r => r.id !== id);
  saveAndRender();
};

// Export Functions
function toCsvLine(fields) {
  return fields.map(v => {
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }).join(',');
}

function triggerCsvDownload(filename, csvContent) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 1. Export Detailed Inventory CSV (for Excel / Archive)
document.getElementById('btn-export-raw-csv').addEventListener('click', () => {
  const headers = [
    'Set Code', 'Set Name', 'Collector Number', 'Quantity', 'Card Name',
    'Variant / Frame', 'Finish', 'Condition', 'Language',
    'Scryfall Market USD', 'Target L4 Price USD', 'TCGplayer ID / SKU', 'Box / Location'
  ];
  const lines = [toCsvLine(headers)];
  // Reverse so row 1 is the first physical card placed in the box
  const chronological = [...inventory].reverse();
  for (const item of chronological) {
    const matched = findMatchingTcgCsvRow(item);
    const sku = matched ? matched['TCGplayer Id'] : item.tcgProductId;
    lines.push(toCsvLine([
      item.setCode,
      item.setName,
      item.collectorNumber,
      item.qty,
      item.cardName,
      item.variant,
      item.finish,
      item.condition,
      'English',
      (item.marketPrice || 0).toFixed(2),
      calculateTargetL4Price(item).toFixed(2),
      sku,
      item.boxLocation
    ]));
  }
  triggerCsvDownload(`MTG_Scanned_Inventory_${new Date().toISOString().slice(0, 10)}.csv`, lines.join('\r\n'));
});

// 2. Export Official TCGplayer Level 4 Staged Inventory CSV
document.getElementById('btn-export-tcg-csv').addEventListener('click', () => {
  const bulkThreshold = parseFloat(bulkSkipInput.value) || 0.25;
  const excludeBulk = excludeBulkCheckbox.checked;

  const headers = tcgPricingHeaders || [
    'TCGplayer Id', 'Product Line', 'Set Name', 'Product Name', 'Title',
    'Number', 'Rarity', 'Condition', 'TCG Market Price', 'TCG Direct Low',
    'TCG Low Price With Shipping', 'TCG Low Price', 'Total Quantity',
    'Add to Quantity', 'TCG Marketplace Price', 'Photo URL'
  ];

  const lines = [toCsvLine(headers)];
  const chronological = [...inventory].reverse();

  for (const item of chronological) {
    if (excludeBulk && item.marketPrice > 0 && item.marketPrice < bulkThreshold) {
      continue;
    }
    const targetPrice = calculateTargetL4Price(item).toFixed(2);
    const matched = findMatchingTcgCsvRow(item);
    const tcgCondition = item.finish === 'Normal' ? item.condition : `${item.condition} Foil`;

    if (matched) {
      const outRow = headers.map(h => {
        if (h === 'Add to Quantity') return String(item.qty);
        if (h === 'TCG Marketplace Price') return targetPrice;
        return matched[h] ?? '';
      });
      lines.push(toCsvLine(outRow));
    } else {
      const fallbackRow = {
        'TCGplayer Id': item.tcgProductId || '',
        'Product Line': 'Magic',
        'Set Name': item.setName,
        'Product Name': item.cardName,
        'Title': '',
        'Number': item.collectorNumber,
        'Rarity': '',
        'Condition': tcgCondition,
        'TCG Market Price': (item.marketPrice || 0).toFixed(2),
        'TCG Direct Low': '',
        'TCG Low Price With Shipping': '',
        'TCG Low Price': '',
        'Total Quantity': '0',
        'Add to Quantity': String(item.qty),
        'TCG Marketplace Price': targetPrice,
        'Photo URL': ''
      };
      lines.push(toCsvLine(headers.map(h => fallbackRow[h] ?? '')));
    }
  }

  triggerCsvDownload(`TCGplayer_Level4_Upload_${new Date().toISOString().slice(0, 10)}.csv`, lines.join('\r\n'));
});

// Event Listeners & Hotkeys
form.addEventListener('submit', (e) => {
  e.preventDefault();
  handleCardSubmission(collectorInput.value);
});

loadSetBtn.addEventListener('click', () => {
  loadAndCacheSet(setCodeInput.value);
});

setCodeInput.addEventListener('change', () => {
  loadAndCacheSet(setCodeInput.value);
});

// Quick-fix action buttons & hotkeys when collector input is empty
function toggleLastFoil() {
  if (inventory.length === 0) return;
  const last = inventory[0];
  last.finish = last.finish === 'Normal' ? 'Foil' : last.finish === 'Foil' ? 'Etched' : 'Normal';
  const cached = setCache[last.setCode]?.[last.collectorNumber] || BUILTIN_FALLBACK_CARDS[last.setCode]?.[last.collectorNumber];
  if (cached) {
    last.marketPrice = getScryfallMarketPrice(cached, last.finish);
  }
  updatePreviewPanel(last);
  saveAndRender();
}

function toggleLastCondition(targetCond) {
  if (inventory.length === 0) return;
  const last = inventory[0];
  last.condition = last.condition === targetCond ? 'Near Mint' : targetCond;
  updatePreviewPanel(last);
  saveAndRender();
}

function undoLastEntry() {
  if (inventory.length === 0) return;
  inventory.shift();
  if (inventory.length > 0) updatePreviewPanel(inventory[0]);
  saveAndRender();
}

document.getElementById('btn-inc-last').addEventListener('click', () => handleCardSubmission('+'));
document.getElementById('btn-foil-last').addEventListener('click', toggleLastFoil);
document.getElementById('btn-lp-last').addEventListener('click', () => toggleLastCondition('Lightly Played'));
document.getElementById('btn-undo-last').addEventListener('click', undoLastEntry);

collectorInput.addEventListener('keydown', (e) => {
  // Single-key hotkeys when the collector number box is empty
  if (collectorInput.value === '') {
    if (e.key === '+') {
      e.preventDefault();
      handleCardSubmission('+');
    } else if (e.key.toLowerCase() === 'f' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      toggleLastFoil();
    } else if (e.key.toLowerCase() === 'l' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      toggleLastCondition('Lightly Played');
    } else if (e.key.toLowerCase() === 'm' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      toggleLastCondition('Moderately Played');
    } else if (e.key.toLowerCase() === 'h' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      toggleLastCondition('Heavily Played');
    }
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undoLastEntry();
  }
});

[priceSourceSelect, priceFloorInput, bulkSkipInput, excludeBulkCheckbox].forEach(el => {
  el.addEventListener('input', saveAndRender);
  el.addEventListener('change', saveAndRender);
});

document.getElementById('btn-load-sample').addEventListener('click', async () => {
  setCodeInput.value = 'MH3';
  await handleCardSubmission('214');
  await handleCardSubmission('234*2');
  await handleCardSubmission('325');
  await handleCardSubmission('15');
});

document.getElementById('btn-clear-all').addEventListener('click', () => {
  inventory = [];
  saveAndRender();
});

// Initialize on load
(function init() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      inventory = JSON.parse(saved);
    }
  } catch (_) {}
  saveAndRender();
  if (inventory.length > 0) {
    updatePreviewPanel(inventory[0]);
  }
  loadAndCacheSet(setCodeInput.value);
  collectorInput.focus();
})();
