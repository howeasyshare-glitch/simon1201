// api/generate-image.js
// 「身材版本2025 v1」＋配件控制：
// Stage 1：依身高 / 體重畫貼身素色「身材基底圖」
// Stage 2：在同一個身材上套 UNIQLO 風格穿搭（含包包 / 帽子選項）

// ===== 共用：依 BMI 給身材描述 =====
function getBodyShapePrompt(heightCm, weightKg) {
  const h = heightCm / 100;
  const bmi = weightKg / (h * h);

  if (!isFinite(bmi)) {
    return `
average realistic body, balanced proportions, neither skinny nor chubby.
    `.trim();
  }

  if (bmi < 19) {
    return `
very slim body, clearly slender limbs, small waist, minimal body fat,
lightweight figure, narrow shoulders and hips.
Do NOT draw thick arms or legs, do NOT draw chubby proportions.
    `.trim();
  }

  if (bmi < 25) {
    return `
average realistic body, balanced proportions, medium muscle and fat,
neither skinny nor chubby, natural and healthy body shape.
Avoid extremely skinny fashion-model proportions.
    `.trim();
  }

  if (bmi < 30) {
    return `
slightly chubby body with soft curves, visibly thicker arms and thighs,
rounder waistline and fuller hips, clearly not a slim model.
Do NOT shrink the body, do NOT make the limbs look skinny.
    `.trim();
  }

  // BMI >= 30
  return `
plus-size figure with full curves, heavier and thicker limbs,
larger waist and hips, round and full body shape, definitely not slim.
Do NOT draw a skinny model, do NOT reduce body width or limb thickness.
  `.trim();
}

// ===== Stage 1：只畫「身材基底圖」(tight neutral clothes) =====
function buildBodyOnlyPrompt(gender, heightCm, weightKg) {
  const genderTextMap = {
    female: "a woman",
    male: "a man",
    neutral: "a person with a gender-neutral look"
  };
  const genderEn = genderTextMap[gender] || "a person";

  const bodyShapeText = getBodyShapePrompt(heightCm, weightKg);

  return `
Draw a clean full-body illustration of a single person:

Person:
- ${genderEn}
- Height around ${heightCm} cm, weight around ${weightKg} kg
- Body shape: ${bodyShapeText}

Clothing for this step:
- Very simple tight neutral clothing (plain fitted top and fitted pants)
- Solid neutral color (for example light grey), no patterns
- Purpose: clearly show the true body shape and proportions

Scene:
- Standing pose, facing forward or slight 3/4 angle
- Neutral studio background (light grey or off-white)
- Soft, even lighting
- No accessories, no bag, no jacket, no hat, no extra items
- No logos, no brand names, no text in the image

Important:
- The person must NOT resemble any real person or celebrity.
- The body proportions must strictly follow the body-shape description above.
  `.trim();
}

// ===== Stage 2：在基底圖上套 UNIQLO 風格穿搭＋配件控制 =====
function buildOutfitStagePrompt(
  gender,
  age,
  style,
  temp,
  heightCm,
  weightKg,
  withBag,
  withHat
) {
  const styleTextMap = {
    casual: "casual daily style",
    minimal: "minimalist office casual style",
    street: "streetwear style",
    sporty: "sporty athleisure style",
    smart: "smart casual style"
  };

  const genderTextMap = {
    female: "a woman",
    male: "a man",
    neutral: "a person with a gender-neutral look"
  };

  const styleText = styleTextMap[style] || "casual daily style";
  const genderEn = genderTextMap[gender] || "a person";

  const ageNum = Number(age);
  const tempNum = Number(temp);
  const bodyShapeText = getBodyShapePrompt(heightCm, weightKg);

  // 配件條件（包包 / 帽子）
  const accessoriesLines = [];
  if (withBag && withHat) {
    accessoriesLines.push(
      "- Accessories: clearly show a bag (crossbody or tote) AND a hat (cap or beanie)."
    );
  } else if (withBag && !withHat) {
    accessoriesLines.push(
      "- Accessories: clearly show one bag (crossbody or tote).",
      "- Do NOT add any hats."
    );
  } else if (!withBag && withHat) {
    accessoriesLines.push(
      "- Accessories: clearly show a hat (cap or beanie).",
      "- Do NOT add any bags, backpacks, or totes."
    );
  } else {
    accessoriesLines.push(
      "- Accessories: do NOT add any bags, backpacks, totes, or hats."
    );
  }

  return `
Use the reference person in the image as the base.
Keep the SAME body shape, proportions, and pose exactly as in the reference.
Do NOT make the body slimmer than in the reference image.

Now dress this same person in a new outfit:

Person:
- ${genderEn}, around ${ageNum} years old
- Height around ${heightCm} cm, weight around ${weightKg} kg
- Body shape: ${bodyShapeText} (must stay the same as the reference image)

Outfit:
- Style: ${styleText}
- Weather: about ${tempNum}°C, comfortable everyday weather
- Brand aesthetic: minimalist Japanese casual wear, similar to UNIQLO lookbook
- Top and bottom should clearly show the outfit (shirt/knit/sweater + pants/skirt)
- Include shoes that match the style
${accessoriesLines.join("\n")}

Scene:
- Same camera angle and overall framing as the reference
- Neutral light background (light grey or off-white)
- Soft natural daylight feeling

Important:
- The person must NOT resemble any real person or celebrity.
- DO NOT change the body thickness or curves; keep arm, leg, waist, and hip size identical to the reference.
- Only change clothing and small accessories as described above.
  `.trim();
}

// ===== 共用：呼叫 gemini-2.5-flash-image（文字→圖 或 圖+文字→圖） =====
async function callGeminiImageModel(apiKey, prompt, baseImageBase64) {
  const endpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=" +
    encodeURIComponent(apiKey);

  const parts = [];

  // Stage 2：有 base 圖時，走 image + text → image
  if (baseImageBase64) {
    parts.push({
      inlineData: {
        mimeType: "image/png",
        data: baseImageBase64
      }
    });
  }

  // prompt 一律最後塞
  parts.push({ text: prompt });

  const body = {
    contents: [
      {
        role: "user",
        parts
      }
    ]
    // 不要塞 responseMimeType / responseModalities，image 模型會自己回圖
  };

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const raw = await resp.text();
  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    console.error("Gemini 非 JSON 回應：", raw);
    throw new Error("Gemini API returned non-JSON response");
  }

  if (!resp.ok) {
    console.error("Gemini API error detail:", resp.status, json);
    const msg = json.error?.message || JSON.stringify(json);
    throw new Error(`Gemini API error: ${resp.status} - ${msg}`);
  }

  const partsResp = json?.candidates?.[0]?.content?.parts || [];
  const imagePart = partsResp.find(
    (p) => p.inlineData && p.inlineData.data
  );

  if (!imagePart) {
    console.error("No image part in Gemini response:", JSON.stringify(json, null, 2));
    throw new Error("No image returned from Gemini");
  }

  return {
    base64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || "image/png"
  };
}

// ===== API handler：前端只看到最後那張穿搭圖 =====
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      gender,
      age,
      style,
      temp,
      height,
      weight,
      withBag,
      withHat
    } = req.body || {};

    if (
      !gender ||
      age === undefined ||
      !style ||
      temp === undefined ||
      height === undefined ||
      weight === undefined
    ) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY not set");
    }

    const heightNum = Number(height);
    const weightNum = Number(weight);

    // --- Stage 1：產生身材基底圖 ---
    const bodyPrompt = buildBodyOnlyPrompt(gender, heightNum, weightNum);
    const bodyImage = await callGeminiImageModel(apiKey, bodyPrompt, null);
    // bodyImage.base64 = 身材基底圖（不回給前端）

    // --- Stage 2：在基底圖上套 UNIQLO 穿搭＋配件條件 ---
    const outfitPrompt = buildOutfitStagePrompt(
      gender,
      age,
      style,
      temp,
      heightNum,
      weightNum,
      !!withBag,
      !!withHat
    );

    const finalImage = await callGeminiImageModel(
      apiKey,
      outfitPrompt,
      bodyImage.base64
    );

    // 回傳最後一張「穿好衣服」的圖
    return res.status(200).json({
      image: finalImage.base64,
      mime: finalImage.mimeType
      // 如果要 debug prompt，可以暫時打開：
      // debug: { bodyPrompt, outfitPrompt }
    });
  } catch (err) {
    console.error("generate-image error:", err);
    return res.status(500).json({ error: err.message || "Unknown error" });
  }
}
