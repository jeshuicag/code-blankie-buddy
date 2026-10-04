import { createFileRoute } from "@tanstack/react-router";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB — Instagram's limit
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // keep well under Instagram's 300 MB Reel limit

const ZERNIO_BASE = "https://zernio.com/api/v1";

export const Route = createFileRoute("/api/public/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const formData = await request.formData();
        const picture = formData.get("picture");
        const userId = String(formData.get("userId") ?? "");
        if (!/^[a-f0-9]{32}$/.test(userId)) {
          return new Response("Missing or invalid user ID", { status: 400 });
        }

        // Optional contact details, included in the caption.
        const location = String(formData.get("location") ?? "").trim();
        const phone = String(formData.get("phone") ?? "").trim();
        const caption = String(formData.get("caption") ?? "").trim();
        if (caption.length > 2000) {
          return new Response("Caption is too long (max 2000 characters)", {
            status: 400,
          });
        }
        if (location.length > 100) {
          return new Response("Location is too long (max 100 characters)", {
            status: 400,
          });
        }
        if (phone && !/^\+?[\d\s().-]{5,20}$/.test(phone)) {
          return new Response("That doesn't look like a phone number", {
            status: 400,
          });
        }

        if (!(picture instanceof File)) {
          return new Response("Missing picture file", { status: 400 });
        }
        // Instagram only accepts JPEG and PNG.
        if (!["image/jpeg", "image/png"].includes(picture.type)) {
          return new Response("Only JPEG or PNG pictures can be posted to Instagram", {
            status: 415,
          });
        }
        if (picture.size > MAX_SIZE_BYTES) {
          return new Response("Picture is too large (max 8 MB)", {
            status: 413,
          });
        }

        // Optional Reel video (picture + voice recording, made on the device).
        const videoField = formData.get("video");
        const video = videoField instanceof File ? videoField : null;
        if (video) {
          if (video.type !== "video/mp4") {
            return new Response("Reels must be MP4 videos", { status: 415 });
          }
          if (video.size > MAX_VIDEO_BYTES) {
            return new Response("Reel is too large (max 100 MB)", { status: 413 });
          }
        }
        const media = video ?? picture;
        const mediaType = video ? "video" : "image";

        const apiKey = process.env["ZERNIO_API_KEY"];
        if (!apiKey) {
          return new Response("Zernio API key is not configured", { status: 500 });
        }

        const buffer = Buffer.from(await picture.arrayBuffer());
        const mediaBuffer = video ? Buffer.from(await video.arrayBuffer()) : buffer;
        const authHeaders = {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        };

        try {
          // 1. Ask Zernio for a presigned upload URL.
          const presignRes = await fetch(`${ZERNIO_BASE}/media/presign`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              filename: media.name || (video ? "reel.mp4" : "photo.jpg"),
              contentType: media.type,
            }),
          });
          if (!presignRes.ok) {
            const detail = await presignRes.text();
            return new Response(`Zernio media upload failed: ${detail}`, {
              status: 422,
            });
          }
          const presign = (await presignRes.json()) as {
            uploadUrl: string;
            publicUrl: string;
          };

          // 2. Upload the media bytes directly to that URL.
          const putRes = await fetch(presign.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": media.type },
            body: new Uint8Array(mediaBuffer),
          });
          if (!putRes.ok) {
            const detail = await putRes.text();
            return new Response(`Zernio media upload failed: ${detail}`, {
              status: 422,
            });
          }

          // 3. Find the first connected Instagram account.
          const accountsRes = await fetch(`${ZERNIO_BASE}/accounts`, {
            headers: authHeaders,
          });
          if (!accountsRes.ok) {
            const detail = await accountsRes.text();
            return new Response(`Could not list Zernio accounts: ${detail}`, {
              status: 422,
            });
          }
          const { accounts } = (await accountsRes.json()) as {
            accounts: Array<{ _id: string; platform: string; isActive?: boolean }>;
          };
          const instagram = accounts.find(
            (a) => a.platform === "instagram" && a.isActive !== false
          );
          if (!instagram) {
            return new Response(
              "No Instagram account is connected to your Zernio account. Connect a Business or Creator account at zernio.com first.",
              { status: 409 }
            );
          }

          // 4. Publish the post to Instagram right away.
          const captionLines: string[] = [];
          if (caption) {
            captionLines.push(caption, "");
          } else {
            if (location) captionLines.push(`📍 ${location}`);
            if (phone) captionLines.push(`📞 ${phone}`);
          }
          captionLines.push(`#pu${userId}`);
          const postRes = await fetch(`${ZERNIO_BASE}/posts`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              content: captionLines.join("\n"),
              mediaItems: [{ type: mediaType, url: presign.publicUrl }],
              platforms: [{ platform: "instagram", accountId: instagram._id }],
              publishNow: true,
            }),
          });
          if (!postRes.ok) {
            const detail = await postRes.text();
            return new Response(`Zernio could not publish the post: ${detail}`, {
              status: 422,
            });
          }
          const post = (await postRes.json()) as { post?: { _id?: string } };

          // Also keep a local copy in the server's temporary directory.
          const safeName = picture.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const filename = `${Date.now()}-${safeName}`;
          const dir = "/tmp/uploads";
          await mkdir(dir, { recursive: true });
          await writeFile(join(dir, filename), buffer);

          return Response.json({
            posted: true,
            hashtag: `#pu${userId}`,
            instagramAccountId: instagram._id,
            zernioPostId: post.post?._id ?? null,
            filename,
            size: picture.size,
            type: picture.type,
          });
        } catch (err) {
          return new Response(
            `Unexpected error posting to Instagram: ${err instanceof Error ? err.message : String(err)}`,
            { status: 500 }
          );
        }
      },
    },
  },
});
