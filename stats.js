// runStatsExtractor
/**
 * Collect Daily Rewards + Fashion Season Rewards
 * Phase 1: Detect available rewards
 * Phase 2: Collect them via POST
 */
module.exports = async function runStatsExtractor(page) {
  console.log("🎁 [BP] Starting reward collection sub-code");

  try {
    // ─────────────────────────────────────────────
    // PHASE 1 — OPEN POPUP & CAPTURE RESPONSE
    // ─────────────────────────────────────────────

    console.log("📄 [BP] Navigating to profile page...");
    await page.goto("https://v3.g.ladypopular.com/profile.php", {
      waitUntil: "networkidle"
    });

    console.log("🕵️ [BP] Waiting for daily quests popup response...");

    const responsePromise = page.waitForResponse(res =>
      res.url().includes("/ajax/battlepass/quests.php") &&
      res.request().method() === "GET" &&
      res.url().includes("type=getDailyQuestsPopup")
    );

    // Trigger popup (same click user performs)
    await page.click('[data-popup="daily-quests"]');

    const response = await responsePromise;
    const popupData = await response.json();

    console.log("✅ [BP] Popup data received");

    // ─────────────────────────────────────────────
    // PHASE 1 — PARSE REWARDS
    // ─────────────────────────────────────────────

    const reward_collections_1 = [];
    const reward_collections_2 = [];
    const reward_collections_3 = [];

    // ───── TYPE 1 (Pure JSON quests) ─────
    if (Array.isArray(popupData.dailyQuests)) {
      for (const quest of popupData.dailyQuests) {
        if (quest.status === "4") {
          reward_collections_1.push(quest.id);
        }
      }
    }

    console.log(`🟦 [BP] Type 1 rewards found: ${reward_collections_1.length}`);

    // ───── TYPE 2 (HTML daily chests) ─────
    if (typeof popupData.dailyChests === "string") {
      const dailyChestHtml = popupData.dailyChests;
      const dailyChestMatches = [...dailyChestHtml.matchAll(
        /data-quest="(\d+)"[^>]*data-chest-index="(\d+)"[^>]*class="[^"]*daily-chest semi-opened[^"]*"/g
      )];

      for (const match of dailyChestMatches) {
        reward_collections_2.push({
          quest_id: Number(match[1]),
          chest_id: Number(match[2]) + 1
        });
      }
    }

    console.log(`🟩 [BP] Type 2 rewards found: ${reward_collections_2.length}`);

    // ───── TYPE 3 (Fashion season rewards) ─────
    if (typeof popupData.seasonProgress === "string") {
      const seasonHtml = popupData.seasonProgress;

      const liMatches = [...seasonHtml.matchAll(
        /<li[^>]*class="([^"]*(level-reached|last-reached)[^"]*)"[^>]*>([\s\S]*?)<\/li>/g
      )];

      for (const li of liMatches) {
        const liContent = li[3];

        const levelMatch = liContent.match(/<span class="level">(\d+)<\/span>/);
        if (!levelMatch) continue;

        const levelNumber = Number(levelMatch[1]);

        // Explicit exclusions
        if (levelNumber === 25 || levelNumber === 29) continue;

        // Right chest only
        const rightChestMatch = liContent.match(
          /<div[^>]*class="[^"]*chest-right[^"]*c(\d+-\d+)[^"]*"[^>]*data-chest-id="(\d+)"/
        );

        if (!rightChestMatch) continue;

        reward_collections_3.push({
          chest_css_class: `c${rightChestMatch[1]}`,
          chest_id: Number(rightChestMatch[2])
        });
      }
    }

    console.log(`🟨 [BP] Type 3 rewards found: ${reward_collections_3.length}`);

    // ─────────────────────────────────────────────
    // PHASE 2 — COLLECT REWARDS
    // ─────────────────────────────────────────────

    // ───── TYPE 1 COLLECTION ─────
    for (const quest_id of reward_collections_1) {
      console.log(`🎯 [BP] Collecting Type 1 quest ${quest_id}`);

      const res = await page.request.post(
        "https://v3.g.ladypopular.com/ajax/battlepass/quests.php",
        {
          form: {
            type: "giveDailyQuestReward",
            quest_id,
            chest_id: -1
          }
        }
      );

      if (!res.ok()) {
        console.error(`❌ [BP] Type 1 failed for quest ${quest_id}`);
        return false;
      }
    }

    // ───── TYPE 2 COLLECTION ─────
    for (const item of reward_collections_2) {
      console.log(
        `🎯 [BP] Collecting Type 2 quest ${item.quest_id}, chest ${item.chest_id}`
      );

      const res = await page.request.post(
        "https://v3.g.ladypopular.com/ajax/battlepass/quests.php",
        {
          form: {
            type: "giveDailyQuestReward",
            quest_id: item.quest_id,
            chest_id: item.chest_id
          }
        }
      );

      if (!res.ok()) {
        console.error(
          `❌ [BP] Type 2 failed for quest ${item.quest_id}`
        );
        return false;
      }
    }

    // ───── TYPE 3 COLLECTION ─────
    for (const chest of reward_collections_3) {
      console.log(
        `🎯 [BP] Collecting Type 3 chest ${chest.chest_id} (${chest.chest_css_class})`
      );

      const res = await page.request.post(
        "https://v3.g.ladypopular.com/ajax/battlepass/chest.php",
        {
          form: {
            chest_id: chest.chest_id,
            chest_css_class: chest.chest_css_class,
            previousSeason: 0
          }
        }
      );

      if (!res.ok()) {
        console.error(
          `❌ [BP] Type 3 failed for chest ${chest.chest_id}`
        );
        return false;
      }
    }

    console.log("🎉 [BP] All available rewards collected successfully");
    return true;

  } catch (err) {
    console.error("🔥 [BP] Fatal error in reward collection sub-code");
    console.error(err);
    return false;
  }
};
