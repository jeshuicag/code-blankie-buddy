// Recognizes produce in a picture, entirely on the phone (TensorFlow.js MobileNet, ~2 MB).
import type { MobileNet } from "@tensorflow-models/mobilenet";

// ImageNet labels that are produce → friendly name.
const PRODUCE: Record<string, string> = {
  banana: "bananas",
  "granny smith": "apples",
  orange: "oranges",
  lemon: "lemons",
  strawberry: "strawberries",
  pineapple: "pineapples",
  fig: "figs",
  pomegranate: "pomegranates",
  "custard apple": "custard apples",
  jackfruit: "jackfruit",
  broccoli: "broccoli",
  cauliflower: "cauliflower",
  cucumber: "cucumbers",
  "bell pepper": "peppers",
  "head cabbage": "cabbage",
  zucchini: "zucchini",
  "spaghetti squash": "squash",
  "acorn squash": "squash",
  "butternut squash": "butternut squash",
  artichoke: "artichokes",
  cardoon: "cardoons",
  mushroom: "mushrooms",
  corn: "corn",
  ear: "corn",
};

let modelPromise: Promise<MobileNet> | null = null;

function loadModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      await import("@tensorflow/tfjs");
      const mobilenet = await import("@tensorflow-models/mobilenet");
      return mobilenet.load({ version: 2, alpha: 0.5 });
    })();
    modelPromise.catch(() => (modelPromise = null));
  }
  return modelPromise;
}

/** Start downloading the model early so the first picture is fast. */
export function preloadProduceModel() {
  loadModel().catch(() => {});
}

/** Returns produce names found in the picture (best first), or [] if none. */
export async function detectProduce(imageUrl: string): Promise<string[]> {
  const model = await loadModel();
  const img = new Image();
  img.src = imageUrl;
  await img.decode();
  const predictions = await model.classify(img, 10);
  const found: string[] = [];
  for (const p of predictions) {
    if (p.probability < 0.05) continue;
    for (const label of p.className.toLowerCase().split(",").map((s) => s.trim())) {
      const name = PRODUCE[label];
      if (name && !found.includes(name)) found.push(name);
    }
  }
  return found.slice(0, 2);
}

export function buildCaption(produce: string[], location: string, phone: string) {
  const what = produce.length ? `Fresh ${produce.join(" and ")} from a local farm` : "Local farm";
  const where = location.trim() ? ` near ${location.trim()}` : "";
  const contact = phone.trim() || "local tourism guide";
  return `${what}${where}. Contact via ${contact}.`;
}
