// Recognizes produce in a picture, entirely on the phone.
// MobileNet (bundled in public/models/mobilenet) turns the picture into features; a small head retrained on
// 36 fruits/vegetables (public/models/produce, ~180 KB) names the produce.
import type { MobileNet } from "@tensorflow-models/mobilenet";
import type { LayersModel } from "@tensorflow/tfjs";

// Order must match the training labels.
const LABELS = [
  "apples",
  "bananas",
  "beetroot",
  "peppers",
  "cabbage",
  "peppers",
  "carrots",
  "cauliflower",
  "chilli peppers",
  "corn",
  "cucumbers",
  "eggplant",
  "garlic",
  "ginger",
  "grapes",
  "jalapeños",
  "kiwis",
  "lemons",
  "lettuce",
  "mangoes",
  "onions",
  "oranges",
  "peppers",
  "pears",
  "peas",
  "pineapples",
  "pomegranates",
  "potatoes",
  "radishes",
  "soy beans",
  "spinach",
  "corn",
  "sweet potatoes",
  "tomatoes",
  "turnips",
  "watermelons",
];
const MIN_CONFIDENCE = 0.35;

type Models = { tf: typeof import("@tensorflow/tfjs"); base: MobileNet; head: LayersModel };
let modelPromise: Promise<Models> | null = null;

function loadModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const tf = await import("@tensorflow/tfjs");
      const mobilenet = await import("@tensorflow-models/mobilenet");
      const [base, head] = await Promise.all([
        // Bundled with the app (public/models/mobilenet) so the first open works offline.
        mobilenet.load({ version: 2, alpha: 0.5, modelUrl: "/models/mobilenet/model.json", inputRange: [0, 1] }),
        tf.loadLayersModel("/models/produce/model.json"),
      ]);
      return { tf, base, head };
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
  const { tf, base, head } = await loadModel();
  const img = new Image();
  img.src = imageUrl;
  await img.decode();
  const probs = tf.tidy(() => {
    const features = base.infer(img, true) as import("@tensorflow/tfjs").Tensor;
    return (head.predict(features) as import("@tensorflow/tfjs").Tensor).dataSync();
  });
  // Sum confusable labels (e.g. the three pepper classes) into one name.
  const score = new Map<string, number>();
  probs.forEach((p, i) => {
    const name = LABELS[i]!;
    score.set(name, (score.get(name) ?? 0) + p);
  });
  return [...score.entries()]
    .filter(([, p]) => p >= MIN_CONFIDENCE)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([name]) => name);
}

export function buildCaption(produce: string[], location: string, phone: string) {
  const what = produce.length ? `Fresh ${produce.join(" and ")}(?) from a local farm` : "Local farm";
  const where = location.trim() ? ` near ${location.trim()}` : "";
  const contact = phone.trim() || "local tourism guide";
  return `${what}${where}. Contact via ${contact}.`;
}
