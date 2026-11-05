import { world, system, ItemStack, EquipmentSlot, BlockPermutation } from "@minecraft/server";

// =====================================================================
//  Энисота: Хоррор-аддон — система кармы и появления монстра
// =====================================================================

const KARMA_KEY = "enisota_carma";
const HAS_ARTIFACT_KEY = "enisota_has_artifact";
const ARTIFACT_ID = "enisota:karma_artifact";
const ENISOTA_ID = "enisota:enisota";

const KARMA_MIN = 0;
const KARMA_MAX = 100;

// События кармы: (описание, изменение)
const CARMA_EVENTS = {
  feed_animal: { desc: "Вы накормили животное (+5)", delta: 5 },
  plant_seed: { desc: "Вы посадили семена (+4)", delta: 4 },
  kill_hostile: { desc: "Вы победили враждебного монстра (+6)", delta: 6 },
  kill_animal: { desc: "Вы убили животное (-8)", delta: -8 },
  kill_villager: { desc: "Вы убили жителя (-15)", delta: -15 },
};

// Семена, при посадке которых растёт карма
const SEED_ITEMS = new Set([
  "minecraft:wheat_seeds",
  "minecraft:carrot",
  "minecraft:potato",
  "minecraft:beetroot_seeds",
  "minecraft:melon_seeds",
  "minecraft:pumpkin_seeds",
  "minecraft:torchflower_seeds",
  "minecraft:pitcher_pod",
  "minecraft:cocoa_beans",
  "minecraft:sweet_berries",
]);

// Еда для животных (кормление)
const FEED_ITEMS = new Set([
  "minecraft:wheat",
  "minecraft:carrot",
  "minecraft:potato",
  "minecraft:beetroot",
  "minecraft:apple",
  "minecraft:golden_carrot",
  "minecraft:hay_block",
  "minecraft:sweet_berries",
]);

// Семейства враждебных монстров (убийство повышает карму)
const HOSTILE_FAMILIES = ["zombie", "skeleton", "spider", "creeper", "witch", "enderman", "slime", "blaze", "ghast", "warden", "endermite", "silverfish", "stray", "drowned", "husk", "ravager", "pillager", "vindicator", "evoker", "shulker"];

// Семейства пассивных животных (убийство понижает карму)
const ANIMAL_FAMILIES = ["cow", "pig", "sheep", "chicken", "rabbit", "wolf", "cat", "horse", "fox", "turtle", "panda", "bee", "llama", "goat", "parrot", "donkey", "mule", "axolotl", "frog", "snowgolem", "allay", "armadillo"];

// Подарки, которые Энисота может дарить при высокой карме
const GIFTS = [
  "minecraft:diamond",
  "minecraft:emerald",
  "minecraft:golden_apple",
  "minecraft:experience_bottle",
  "minecraft:ender_pearl",
  "minecraft:netherite_scrap",
  "enisota:karma_artifact",
];

function getCarma(player) {
  const val = player.getDynamicProperty(KARMA_KEY);
  if (typeof val !== "number") return 50;
  return val;
}

function setCarma(player, value) {
  const clamped = Math.max(KARMA_MIN, Math.min(KARMA_MAX, value));
  player.setDynamicProperty(KARMA_KEY, clamped);
  return clamped;
}

function adjustCarma(player, delta, desc) {
  const before = getCarma(player);
  const after = setCarma(player, before + delta);
  const arrow = after > before ? "▲" : "▼";
  player.sendMessage(`§5[Карма]§r ${desc} §7(${after}%)`);
}

function showCarma(player) {
  const karma = getCarma(player);
  let state;
  if (karma < 50) state = "§cЭнисота враждебна к вам!";
  else if (karma >= 70) state = "§aЭнисота доверяет вам и может дарить дары.";
  else state = "§eЭнисота пока относится к вам нейтрально.";
  player.sendMessage(`§5[Артефакт кармы]§r Ваша карма: §b${karma}%§r. ${state}`);
}

// ---------------------------------------------------------------------
//  Выдача артефакта при первом появлении
// ---------------------------------------------------------------------
function maybeGiveArtifact(player) {
  const has = player.getDynamicProperty(HAS_ARTIFACT_KEY);
  if (has === true) return;
  player.setDynamicProperty(HAS_ARTIFACT_KEY, true);
  if (!getCarma(player)) setCarma(player, 50);

  const inv = player.getComponent("minecraft:inventory");
  if (inv && inv.container) {
    try {
      inv.container.addItem(new ItemStack(ARTIFACT_ID, 1));
    } catch (e) {
      // Игровой инвентарь занят — выдаём предмет
      world.sendMessage(`Вы получили Артефакт кармы`);
    }
  }
  player.sendMessage("§5Вы почувствовали, как холод коснулся вашей души...§r");
  player.sendMessage("§7Получен §b[Артефакт кармы]§7. Используйте его (ПКМ), чтобы увидеть свою карму.");
  player.playSound("enisota.whisper");
}

// ---------------------------------------------------------------------
//  Поиск точки спавна рядом с игроком
// ---------------------------------------------------------------------
function getSpawnLocation(player, minDist, maxDist) {
  const pos = player.location;
  const angle = Math.random() * Math.PI * 2;
  const dist = minDist + Math.random() * (maxDist - minDist);
  const dx = Math.round(Math.cos(angle) * dist);
  const dz = Math.round(Math.sin(angle) * dist);

  const dim = player.dimension;
  const baseY = Math.floor(pos.y);
  for (let y = baseY; y > baseY - 32 && y > -64; y--) {
    const block = dim.getBlock({ x: pos.x + dx, y, z: pos.z + dz });
    if (!block) continue;
    const below = dim.getBlock({ x: pos.x + dx, y: y - 1, z: pos.z + dz });
    if (below && below.isSolid) {
      // Темнота (свет < 5)
      const light = block.getLight();
      if (light === undefined || light < 5) {
        return { x: pos.x + dx + 0.5, y: y + 0.1, z: pos.z + dz + 0.5 };
      }
    }
  }
  return null;
}

function spawnEnisota(player) {
  const karma = getCarma(player);
  const hostile = karma < 50;

  const loc = getSpawnLocation(player, 14, 26);
  if (!loc) return;

  const dimension = player.dimension;
  const enisota = dimension.spawnEntity(ENISOTA_ID, loc);

  // Выбираем вариант по карме
  if (hostile) {
    enisota.triggerEvent("enisota:set_hostile");
    player.playSound("enisota.creepy");
  } else {
    enisota.triggerEvent("enisota:set_passive");
  }

  // Храним карму игрока на сущности (для событий подарков)
  enisota.setDynamicProperty("enisota_owner_carma", karma);
  enisota.setDynamicProperty("enisota_owner", player.name);
  enisota.setDynamicProperty("enisota_is_hostile", hostile);
}

// ---------------------------------------------------------------------
//  Подарки от мирной Энисоты при высокой карме
// ---------------------------------------------------------------------
function maybeGift(enisota) {
  if (enisota.isValid && enisota.getDynamicProperty("enisota_is_hostile") === false) {
    const karma = enisota.getDynamicProperty("enisota_owner_carma") ?? 0;
    if (karma >= 70 && Math.random() < 0.15) {
      const gift = GIFTS[Math.floor(Math.random() * GIFTS.length)];
      const dimension = enisota.dimension;
      const loc = enisota.location;
      const itemEntity = dimension.spawnItem(new ItemStack(gift, 1), loc);
      itemEntity.applyImpulse({ x: (Math.random() - 0.5) * 2, y: 0.4, z: (Math.random() - 0.5) * 2 });
      dimension.playSound("enisota.rumble", loc);
    }
  }
}

// ---------------------------------------------------------------------
//  Периодический спавн: частота растёт с каждым игровым днём
// ---------------------------------------------------------------------
system.runInterval(() => {
  const players = world.getAllPlayers();
  if (players.length === 0) return;

  const day = world.getDay();
  // Базовый шанс с каждым днём растёт, максимум 0.75
  const chance = Math.min(0.12 + day * 0.015, 0.75);

  for (const player of players) {
    maybeGiveArtifact(player);
    if (Math.random() < chance) {
      spawnEnisota(player);
    }
  }

  // Редкие жуткие шорохи в мире
  if (Math.random() < 0.03) {
    const player = players[Math.floor(Math.random() * players.length)];
    const loc = player.location;
    const dim = player.dimension;
    const soundId = Math.random() < 0.5 ? "enisota.whisper" : "enisota.rustle";
    dim.playSound(soundId, { x: loc.x + (Math.random() - 0.5) * 10, y: loc.y, z: loc.z + (Math.random() - 0.5) * 10 });
  }

  // Подарки от мирных Энисот
  for (const e of world.getDimension("overworld").getEntities({ type: ENISOTA_ID })) {
    maybeGift(e);
  }
}, 200); // каждые 10 секунд

// ---------------------------------------------------------------------
//  Обработчики событий
// ---------------------------------------------------------------------

// Использование Артефакта кармы — показать уровень в чате
world.afterEvents.itemUse.subscribe((event) => {
  const player = event.player;
  const item = event.itemStack;
  if (item && item.typeId === ARTIFACT_ID) {
    maybeGiveArtifact(player);
    showCarma(player);
  }
});

// Первое появление игрока — выдача артефакта
world.afterEvents.playerSpawn.subscribe((event) => {
  if (!event.initialSpawn) return;
  system.run(() => maybeGiveArtifact(event.player));
});

// Кормление животных
world.afterEvents.playerInteractWithEntity.subscribe((event) => {
  const player = event.player;
  const target = event.target;
  const item = event.itemStack;
  if (!item || !target) return;
  if (FEED_ITEMS.has(item.typeId)) {
    const family = target.getComponent("minecraft:type_family");
    if (family && family.hasFamily("animal")) {
      adjustCarma(player, CARMA_EVENTS.feed_animal.delta, CARMA_EVENTS.feed_animal.desc);
    }
  }
});

// Посадка семян
world.afterEvents.itemUseOnBlock.subscribe((event) => {
  const player = event.player;
  const item = event.itemStack;
  if (!item) return;
  if (SEED_ITEMS.has(item.typeId)) {
    adjustCarma(player, CARMA_EVENTS.plant_seed.delta, CARMA_EVENTS.plant_seed.desc);
  }
});

// Смерти: убийство монстров, животных, жителей
world.afterEvents.entityDie.subscribe((event) => {
  const dead = event.deadEntity;
  if (!dead) return;

  const killer = event.damageSource.damagingEntity;
  if (!killer || killer.typeId !== "minecraft:player") return;

  const attacker = killer;
  const family = dead.getComponent("minecraft:type_family");
  if (!family) return;

  if (family.hasFamily("animal")) {
    adjustCarma(attacker, CARMA_EVENTS.kill_animal.delta, CARMA_EVENTS.kill_animal.desc);
  } else if (family.hasFamily("villager")) {
    adjustCarma(attacker, CARMA_EVENTS.kill_villager.delta, CARMA_EVENTS.kill_villager.desc);
  } else {
    for (const fam of HOSTILE_FAMILIES) {
      if (family.hasFamily(fam)) {
        adjustCarma(attacker, CARMA_EVENTS.kill_hostile.delta, CARMA_EVENTS.kill_hostile.desc);
        break;
      }
    }
  }
});
