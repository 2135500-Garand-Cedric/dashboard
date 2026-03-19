type VerbType = "ru" | "u" | "suru" | "kuru";

export function conjugateVerb(base: string, reading: string, type: VerbType) {
  const forms: Record<string, { form: string; reading: string }> = {};

  // Ichidan (ru)
  if (type === "ru") {
    const stem = base.slice(0, -1);
    const rStem = reading.slice(0, -1);

    forms["masu"] = { form: stem + "ます", reading: rStem + "ます" };
    forms["masen"] = { form: stem + "ません", reading: rStem + "ません" };
    forms["nai"] = { form: stem + "ない", reading: rStem + "ない" };
    forms["ta"] = { form: stem + "た", reading: rStem + "た" };
    forms["nakatta"] = { form: stem + "なかった", reading: rStem + "なかった" };
    forms["mashita"] = { form: stem + "ました", reading: rStem + "ました" };
    forms["masen_deshita"] = { form: stem + "ませんでした", reading: rStem + "ませんでした" };
    forms["te"] = { form: stem + "て", reading: rStem + "て" };
    forms["volitional"] = { form: stem + "よう", reading: rStem + "よう" };
    forms["potential"] = { form: stem + "られる", reading: rStem + "られる" };
    forms["tai"] = { form: stem + "たい", reading: rStem + "たい" };
  }

  // Godan (very simplified for now: assumes -ku ending like 書く)
  if (type === "u") {
    return conjugateGodan(base, reading);
  }

  // Irregular
  if (type === "suru") {
    const stemKanji = base.slice(0, -2);      // remove "する"
    const stemReading = reading.slice(0, -2); // remove "する"

    forms["masu"] = { form: stemKanji + "します", reading: stemReading + "します" };
    forms["masen"] = { form: stemKanji + "しません", reading: stemReading + "しません" };
    forms["nai"] = { form: stemKanji + "しない", reading: stemReading + "しない" };
    forms["ta"] = { form: stemKanji + "した", reading: stemReading + "した" };
    forms["nakatta"] = { form: stemKanji + "しなかった", reading: stemReading + "しなかった" };
    forms["mashita"] = { form: stemKanji + "しました", reading: stemReading + "しました" };
    forms["masen_deshita"] = { form: stemKanji + "しませんでした", reading: stemReading + "しませんでした" };
    forms["te"] = { form: stemKanji + "して", reading: stemReading + "して" };
    forms["volitional"] = { form: stemKanji + "しよう", reading: stemReading + "しよう" };
    forms["potential"] = { form: stemKanji + "できる", reading: stemReading + "できる" };
    forms["tai"] = { form: stemKanji + "したい", reading: stemReading + "したい" };
  }


  if (type === "kuru") {
    const stemKanji = base.slice(0, -2);      // remove "くる" / "来る"
    const stemReading = reading.slice(0, -2);

    forms["masu"] = { form: stemKanji + "きます", reading: stemReading + "きます" };
    forms["masen"] = { form: stemKanji + "きません", reading: stemReading + "きません" };
    forms["nai"] = { form: stemKanji + "こない", reading: stemReading + "こない" };
    forms["ta"] = { form: stemKanji + "きた", reading: stemReading + "きた" };
    forms["nakatta"] = { form: stemKanji + "こなかった", reading: stemReading + "こなかった" };
    forms["mashita"] = { form: stemKanji + "きました", reading: stemReading + "きました" };
    forms["masen_deshita"] = { form: stemKanji + "きませんでした", reading: stemReading + "きませんでした" };
    forms["te"] = { form: stemKanji + "きて", reading: stemReading + "きて" };
    forms["volitional"] = { form: stemKanji + "こよう", reading: stemReading + "こよう" };
    forms["potential"] = { form: stemKanji + "こられる", reading: stemReading + "こられる" };
    forms["tai"] = { form: stemKanji + "きたい", reading: stemReading + "きたい" };
  }


  return forms;
}

const godanMap: Record<string, { a: string; i: string; u: string; e: string; o: string }> = {
  "う": { a: "わ", i: "い", u: "う", e: "え", o: "お" },
  "く": { a: "か", i: "き", u: "く", e: "け", o: "こ" },
  "ぐ": { a: "が", i: "ぎ", u: "ぐ", e: "げ", o: "ご" },
  "す": { a: "さ", i: "し", u: "す", e: "せ", o: "そ" },
  "つ": { a: "た", i: "ち", u: "つ", e: "て", o: "と" },
  "ぬ": { a: "な", i: "に", u: "ぬ", e: "ね", o: "の" },
  "む": { a: "ま", i: "み", u: "む", e: "め", o: "も" },
  "ぶ": { a: "ば", i: "び", u: "ぶ", e: "べ", o: "ぼ" },
  "る": { a: "ら", i: "り", u: "る", e: "れ", o: "ろ" },
};

function conjugateGodan(base: string, reading: string) {
  const ending = reading.slice(-1);
  const stemKanji = base.slice(0, -1);
  const stemReading = reading.slice(0, -1);

  const map = godanMap[ending];
  if (!map) throw new Error("Unsupported godan ending");

  return {
    masu: {
      form: stemKanji + map.i + "ます",
      reading: stemReading + map.i + "ます",
    },
    masen: {
      form: stemKanji + map.i + "ません",
      reading: stemReading + map.i + "ません",
    },
    nai: {
      form: stemKanji + map.a + "ない",
      reading: stemReading + map.a + "ない",
    },
    ta: {
      form: stemKanji + getTaForm(ending),
      reading: stemReading + getTaForm(ending),
    },
    nakatta: {
      form: stemKanji + map.a + "なかった",
      reading: stemReading + map.a + "なかった",
    },
    mashita: {
      form: stemKanji + map.i + "ました",
      reading: stemReading + map.i + "ました",
    },
    masen_deshita: {
      form: stemKanji + map.i + "ませんでした",
      reading: stemReading + map.i + "ませんでした",
    },
    te: {
      form: stemKanji + getTeForm(ending),
      reading: stemReading + getTeForm(ending),
    },
    volitional: {
      form: stemKanji + map.o + "う",
      reading: stemReading + map.o + "う",
    },
    potential: {
      form: stemKanji + map.e + "る",
      reading: stemReading + map.e + "る",
    },
    tai: {
      form: stemKanji + map.i + "たい",
      reading: stemReading + map.i + "たい",
    },
  };
}

function getTeForm(ending: string) {
  switch (ending) {
    case "う":
    case "つ":
    case "る":
      return "って";
    case "む":
    case "ぶ":
    case "ぬ":
      return "んで";
    case "く":
      return "いて";
    case "ぐ":
      return "いで";
    case "す":
      return "して";
    default:
      throw new Error("Unknown ending");
  }
}

function getTaForm(ending: string) {
  switch (ending) {
    case "う":
    case "つ":
    case "る":
      return "った";
    case "む":
    case "ぶ":
    case "ぬ":
      return "んだ";
    case "く":
      return "いた";
    case "ぐ":
      return "いだ";
    case "す":
      return "した";
    default:
      throw new Error("Unknown ending");
  }
}
