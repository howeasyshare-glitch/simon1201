// pages/api/search-products.js
// 用 SerpApi 打 Google Shopping，根據 AI 給的 "generic_name + color + category" 找類似商品

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "SERPAPI_KEY not set" });
  }

  try {
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Missing items array" });
    }

    // 為了測試：最多只查 3 個 slot，免得太多 request
    const limitedItems = items.slice(0, 3);

    const results = [];

    for (const item of limitedItems) {
      const {
        slot,          // "top" / "bottom" / "shoes" / "outer" / "bag" / "hat"
        generic_name,  // "oversized cotton crew neck t-shirt"
        color,         // "white"
        style,         // "casual"
        gender         // "female" / "male" / "unisex"
      } = item;

      if (!generic_name) {
        continue;
      }

      let genderText = "";
      if (gender === "female") genderText = "for women";
      else if (gender === "male") genderText = "for men";
      else genderText = "unisex";

      const qParts = [generic_name];
      if (color) qParts.push(color);
      if (style) qParts.push(style);
      if (genderText) qParts.push(genderText);

      const query = qParts.join(" ");

      // 呼叫 SerpApi 的 Google Shopping
      const url = new URL("https://serpapi.com/search.json");
      url.searchParams.set("engine", "google_shopping");
      url.searchParams.set("q", query);
      url.searchParams.set("hl", "en");
      url.searchParams.set("api_key", apiKey);

      const resp = await fetch(url.toString());
      const json = await resp.json();

      if (!resp.ok) {
        console.error("SerpApi error for query:", query, json);
        results.push({
          slot,
          query,
          error: json.error || "SerpApi error"
        });
        continue;
      }

      const shoppingResults = json.shopping_results || [];

      // 取前 3 筆作為「類似商品」
      const mapped = shoppingResults.slice(0, 3).map((r) => ({
  title: r.title,
  source: r.source,
  // price：優先用 extracted_price，沒有就用原始字串
  price: r.extracted_price ?? r.price,
  price_raw: r.price,            // 可選：想看原字串可用
  currency: r.currency || "",
  thumbnail: r.thumbnail,
  // ⚠ 這裡是重點：Google Shopping 結果用的是 product_link
  link: r.product_link || r.link || null
}));


      results.push({
        slot,
        query,
        items: mapped
      });
    }

    return res.status(200).json({ results });
  } catch (err) {
    console.error("search-products error:", err);
    return res.status(500).json({ error: err.message || "Unknown error" });
  }
}
