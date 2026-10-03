import { createFileRoute } from "@tanstack/react-router";

const MAX_SIZE_BYTES = 8 * 1024 * 1024; // Instagram image limit via Zernio
const ZERNIO = "https://zernio.com/api/v1";

async function zernioFetch(path: string, apiKey: string, init: RequestInit = {}) {
  const res = await fetch(`${ZERNIO}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Zernio ${path} failed (${res.status}): ${text}`);
  return text ? JSON.parse(text) : {};
}

export const Route = createFileRoute("/api/public/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["ZERNIO_API_KEY"];
        if (!apiKey) return new Response("Zernio API key not configured", { status: 500 });

        const formData = await request.formData();
        const picture = formData.get("picture");
        const caption = String(formData.get("caption") ?? "");

        if (!(picture instanceof File)) {
          return new Response("Missing picture file", { status: 400 });
        }
        if (!["image/jpeg", "image/png"].includes(picture.type)) {
          return new Response("Only JPEG or PNG images are allowed", { status: 415 });
        }
        if (picture.size > MAX_SIZE_BYTES) {
          return new Response("Picture is too large (max 8 MB)", { status: 413 });
        }

        try {
          // 1. Find the connected Instagram account
          const accData = await zernioFetch("/accounts", apiKey);
          const accounts: Array<{ _id: string; platform: string }> =
            accData.accounts ?? accData.data ?? accData ?? [];
          const ig = accounts.find((a) => a.platform === "instagram");
          if (!ig) return new Response("No Instagram account connected in Zernio", { status: 400 });

          // 2. Get a presigned upload URL
          const safeName = picture.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "photo.jpg";
          const presign = await zernioFetch("/media/presign", apiKey, {
            method: "POST",
            body: JSON.stringify({ filename: safeName, contentType: picture.type, size: picture.size }),
          });

          // 3. Upload the file to storage
          const put = await fetch(presign.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": picture.type },
            body: await picture.arrayBuffer(),
          });
          if (!put.ok) throw new Error(`Media upload failed (${put.status})`);

          // 4. Publish to Instagram
          const post = await zernioFetch("/posts", apiKey, {
            method: "POST",
            headers: { "Idempotency-Key": crypto.randomUUID() },
            body: JSON.stringify({
              content: caption,
              mediaItems: [{ type: "image", url: presign.publicUrl }],
              platforms: [{ platform: "instagram", accountId: ig._id }],
              publishNow: true,
            }),
          });

          return Response.json({
            ok: true,
            instagramUrl: post.post?.platforms?.[0]?.platformPostUrl ?? null,
          });
        } catch (err) {
          console.error(err);
          return new Response(err instanceof Error ? err.message : "Upload failed", { status: 502 });
        }
      },
    },
  },
});
