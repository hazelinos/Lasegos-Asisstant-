const cards = [
  { id: 'ember-fox', name: 'Ember Fox', emoji: '🔥', tier: 'Common', atk: 24, def: 18, hp: 80, ability: 'Burn: +5 ATK pada ronde pertama' },
  { id: 'aqua-serpent', name: 'Aqua Serpent', emoji: '🌊', tier: 'Common', atk: 20, def: 24, hp: 85, ability: 'Flow: +5 DEF pada ronde kedua' },
  { id: 'leaf-sprite', name: 'Leaf Sprite', emoji: '🌿', tier: 'Common', atk: 18, def: 22, hp: 90, ability: 'Heal: +5 HP sekali' },
  { id: 'thunder-lynx', name: 'Thunder Lynx', emoji: '⚡', tier: 'Uncommon', atk: 32, def: 24, hp: 88, ability: 'Quick: +8 ATK jika menyerang lebih dulu' },
  { id: 'frost-wolf', name: 'Frost Wolf', emoji: '❄️', tier: 'Rare', atk: 40, def: 30, hp: 100, ability: 'Freeze: -5 ATK lawan pada ronde pertama' },
  { id: 'shadow-raven', name: 'Shadow Raven', emoji: '🌑', tier: 'Rare', atk: 44, def: 28, hp: 92, ability: 'Dark: 10% bonus damage' },
  { id: 'crimson-dragon', name: 'Crimson Dragon', emoji: '🐉', tier: 'Epic', atk: 58, def: 42, hp: 125, ability: 'Inferno: +10 ATK pada ronde terakhir' },
  { id: 'ocean-titan', name: 'Ocean Titan', emoji: '🌊', tier: 'Epic', atk: 48, def: 58, hp: 145, ability: 'Barrier: +10 DEF pada ronde pertama' },
  { id: 'solar-phoenix', name: 'Solar Phoenix', emoji: '☀️', tier: 'Legendary', atk: 72, def: 55, hp: 155, ability: 'Rebirth: sekali dapat menghidupkan kembali 20 HP' },
  { id: 'void-titan', name: 'Void Titan', emoji: '🌌', tier: 'Mythic', atk: 92, def: 78, hp: 190, ability: 'Void: +15% total combat power' }
];

const tierInfo = {
  Common: { emoji: '⚪', weight: 60 },
  Uncommon: { emoji: '🟢', weight: 24 },
  Rare: { emoji: '🔵', weight: 11 },
  Epic: { emoji: '🟣', weight: 4 },
  Legendary: { emoji: '🟡', weight: 0.9 },
  Mythic: { emoji: '🔴', weight: 0.1 }
};

const users = new Map();

function getUser(id) {
  if (!users.has(id)) users.set(id, { coins: 1000, cards: ['ember-fox'], wins: 0, losses: 0 });
  return users.get(id);
}

function getCard(id) {
  return cards.find(card => card.id === id);
}

function rollTier() {
  const roll = Math.random() * 100;
  let total = 0;
  for (const [tier, info] of Object.entries(tierInfo)) {
    total += info.weight;
    if (roll < total) return tier;
  }
  return 'Common';
}

function gacha(userId, cost = 100) {
  const user = getUser(userId);
  if (user.coins < cost) return { ok: false, reason: 'coin' };
  user.coins -= cost;
  const tier = rollTier();
  const pool = cards.filter(card => card.tier === tier);
  const card = pool[Math.floor(Math.random() * pool.length)];
  user.cards.push(card.id);
  return { ok: true, card, coins: user.coins };
}

function formatCard(card) {
  const tier = tierInfo[card.tier];
  return `${card.emoji} **${card.name}** ${tier.emoji} ${card.tier}\n⚔️ ${card.atk}  🛡️ ${card.def}  ❤️ ${card.hp}\n✨ ${card.ability}`;
}

module.exports = { cards, tierInfo, getUser, getCard, gacha, formatCard };
